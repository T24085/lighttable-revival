(ns lt.objs.menu
  "Provide Electron-based menus and associated behaviors"
  (:require [lt.object :as object]
            [lt.objs.command :as cmd]
            [lt.objs.keyboard :as keyboard]
            [lt.objs.platform :as platform]
            [lt.objs.app :as app]
            [lt.util.dom :as dom]
            [clojure.string :as string])
  (:require-macros [lt.macros :refer [behavior]]))

(def remote (.-remote (js/ltRequire "electron")))
(def Menu (.-Menu remote))
(def MenuItem (.-MenuItem remote))

(declare submenu)

(defn menu-item [opts]
  (let [opts (if-not (:submenu opts)
               opts
               (assoc opts :submenu (submenu (:submenu opts))))
        opts2 (if (:click opts)
               (assoc opts :click (fn []
                                    (try
                                      (when-let [func (:click opts)]
                                        (func))
                                      (catch :default e
                                        (js/lt.objs.console.error e)))))
               opts)]
    (MenuItem. (clj->js opts))))

(defn submenu [items]
  (let [menu (Menu.)]
    (doseq [i items
            :when i]
      (.append menu (menu-item i)))
    menu))

(defn menu [items]
  (let [menu-instance (Menu.)]
    (doseq [i items]
      (.append menu-instance (menu-item i)))
    menu-instance))

(defn show-menu [m]
  (.popup m (.getCurrentWindow remote)))

(dom/on (dom/$ :body) :contextmenu (fn [e]
                                     (dom/prevent e)
                                     (dom/stop-propagation e)
                                     false))

(defn set-menubar [items]
  (let [menubar (Menu.)]
    (doseq [i items
            :when i]
      (.append menubar (menu-item i)))
    (Menu.setApplicationMenu menubar)))

(def key-mappings {"cmd" "Command"
                   "shift" "Shift"
                   "ctrl" "Control"
                   "alt" "Alt"})

(defn command->menu-binding [cmd]
  (let [ks (first (keyboard/cmd->current-binding cmd))
        parts (string/split ks " ")
        parts (for [part parts
                      :let [ks (for [key (string/split part "-")]
                                 (or (key-mappings key) key))]]
                (string/join "+" ks))]
    ;;OSX can only take single key accelerators
    (when (and (seq ks)
               (seq parts)
               (or (not (platform/mac?))
                   (= (count parts) 1)))
      {:accelerator (string/join " " parts)})))

(defn cmd-item
  ([label cmd] (cmd-item label cmd {}))
  ([label cmd opts]
   (merge
    {:label label
     :click (when-not (:role opts)
              (fn [] (cmd/exec! cmd)))}
    opts
    (command->menu-binding cmd))))

(defn unknown-menu []
  (set-menubar [(when (platform/mac?)
                  {:label "" :submenu [(cmd-item "About Light Table" :version)
                                       {:type "separator"}
                                       {:label "Hide Light Table" :accelerator "Command+H" :role "hide"}
                                       {:label "Hide Others" :accelerator "Command+Alt+H" :role "hideothers"}
                                       {:type "separator"}
                                       (cmd-item "Quit Light Table" :quit {:accelerator "Command+Q"})]})

                {:label "Edit" :submenu [(cmd-item "Undo" :editor.undo {:role "undo" :accelerator "CommandOrControl+Z"})
                                         (cmd-item "Redo" :editor.redo {:role "redo" :accelerator "Command+Shift+Z"})
                                         {:type "separator"}
                                         (cmd-item "Cut" :editor.cut {:role "cut" :accelerator "CommandOrControl+X"})
                                         (cmd-item "Copy" :editor.copy {:role "copy" :accelerator "CommandOrControl+C"})
                                         (cmd-item "Paste" :editor.paste {:role "paste" :accelerator "CommandOrControl+V"})
                                         (cmd-item "Select All" :editor.select-all {:role "selectall" :accelerator "CommandOrControl+A"})
                                         ]}

                {:label "Window" :submenu [(cmd-item "Minimize" :window.minimize {:role "minimize" :accelerator "Command+M"})
                                           (cmd-item "Close window" :window.close {:role "close" :accelerator "Command+W"})]}

                {:label "Help" :submenu []}]))

(defn recent-project-items []
  (let [projects (js->clj (.-recents (.info js/ltProjects)) :keywordize-keys true)]
    (if (seq projects)
      (for [project projects]
        {:label (str (:name project) " (" (:path project) ")")
         :click #(.reopen js/ltProjects (:path project))})
      [{:label "No recent projects" :enabled false}])))

(defn main-menu []
  (set-menubar [(when (platform/mac?)
                  {:label "" :submenu [(cmd-item "About Light Table" :version)
                                       {:type "separator"}
                                       {:label "Hide Light Table" :accelerator "Command+H" :role "hide"}
                                       {:label "Hide Others" :accelerator "Command+Alt+H" :role "hideothers"}
                                       {:type "separator"}
                                       (cmd-item "Quit Light Table" :quit {:accelerator "Command+Q"})]})

                {:label "&File" :submenu (into [(cmd-item "New file" :new-file)
                                                (cmd-item "Open file" :open-file)
                                                (cmd-item "Save file" :save)
                                                (cmd-item "Save file as.." :save-as)
                                                (cmd-item "Close file" :tabs.close)
                                                {:type "separator"}
                                                (cmd-item "New project..." :project.new)
                                                (cmd-item "Open project..." :project.open)
                                                (cmd-item "New file in project..." :project.new-file
                                                          {:enabled (boolean (.-current (.info js/ltProjects)))})
                                                {:label "Recent projects" :submenu (recent-project-items)}
                                                (cmd-item "Refresh project files" :project.refresh
                                                          {:enabled (boolean (.-current (.info js/ltProjects)))})
                                                {:type "separator"}
                                                {:label "Open folder" :click #(do
                                                                                (cmd/exec! :workspace.show :force)
                                                                                (cmd/exec! :workspace.add-folder))}
                                                (cmd-item "Open recent workspace" :workspace.show-recents {})
                                                {:label "Settings" :submenu [(cmd-item "User keymap" :keymap.modify-user)
                                                                             (cmd-item "User behaviors" :behaviors.modify-user)
                                                                             (cmd-item "User script" :user.modify-user)]}
                                                {:type "separator"}
                                                (cmd-item "New window" :window.new)
                                                (cmd-item "Close window" :window.close)]
                                               (when-not (platform/mac?)
                                                 [{:type "separator"}
                                                  (cmd-item "About Light Table" :version)
                                                  (cmd-item "Quit Light Table" :quit {:accelerator "Control+Q"})]))}

                (if (platform/mac?)
                  {:label "Edit" :submenu [(cmd-item "Undo" :editor.undo {:role "undo" :accelerator "CommandOrControl+Z"})
                                           (cmd-item "Redo" :editor.redo {:role "redo" :accelerator "CommandOrControl+Shift+Z"})
                                           {:type "separator"}
                                           (cmd-item "Cut" :editor.cut {:role "cut" :accelerator "CommandOrControl+X"})
                                           (cmd-item "Copy" :editor.copy {:role "copy" :accelerator "CommandOrControl+C"})
                                           (cmd-item "Paste" :editor.paste {:role "paste" :accelerator "CommandOrControl+V"})
                                           (cmd-item "Select All" :editor.select-all {:role "selectall" :accelerator "CommandOrControl+A"})
                                           {:type "separator"}
                                           (cmd-item "Jump to matching HTML tag" :html.jump-to-matching-tag {:accelerator "Alt+J"})
                                           {:label "Structural editing" :submenu [(cmd-item "Select expression" :paredit.select.parent)
                                                                                    (cmd-item "Grow right" :paredit.grow.right)
                                                                                    (cmd-item "Grow left" :paredit.grow.left)
                                                                                    (cmd-item "Shrink right" :paredit.shrink.right)
                                                                                    (cmd-item "Shrink left" :paredit.shrink.left)
                                                                                    (cmd-item "Unwrap parent" :paredit.unwrap.parent)
                                                                                    (cmd-item "Move to parent start" :paredit.move.up.backward)
                                                                                    (cmd-item "Move to parent end" :paredit.move.up.forward)
                                                                                    (cmd-item "Move into next form" :paredit.move.down.forward)
                                                                                    (cmd-item "Move into previous form" :paredit.move.down.backward)
                                                                                    (cmd-item "Clear selection" :paredit.select.clear)]}]}
                  {:label "&Edit" :submenu [(cmd-item "Undo" :editor.undo)
                                            (cmd-item "Redo" :editor.redo)
                                            {:type "separator"}
                                            (cmd-item "Cut" :editor.cut)
                                            (cmd-item "Copy" :editor.copy)
                                            (cmd-item "Paste" :editor.paste)
                                            (cmd-item "Select All" :editor.select-all)
                                            {:type "separator"}
                                            (cmd-item "Jump to matching HTML tag" :html.jump-to-matching-tag {:accelerator "Alt+J"})
                                            {:label "Structural editing" :submenu [(cmd-item "Select expression" :paredit.select.parent)
                                                                                     (cmd-item "Grow right" :paredit.grow.right)
                                                                                     (cmd-item "Grow left" :paredit.grow.left)
                                                                                     (cmd-item "Shrink right" :paredit.shrink.right)
                                                                                     (cmd-item "Shrink left" :paredit.shrink.left)
                                                                                     (cmd-item "Unwrap parent" :paredit.unwrap.parent)
                                                                                     (cmd-item "Move to parent start" :paredit.move.up.backward)
                                                                                     (cmd-item "Move to parent end" :paredit.move.up.forward)
                                                                                     (cmd-item "Move into next form" :paredit.move.down.forward)
                                                                                     (cmd-item "Move into previous form" :paredit.move.down.backward)
                                                                                     (cmd-item "Clear selection" :paredit.select.clear)]}]})

                {:label "&Run" :submenu [(cmd-item "Run file" :javascript.run-file
                                                  {:enabled (.hasEditor js/ltProofUI)
                                                   :accelerator (or (:accelerator (command->menu-binding :eval-editor)) "CommandOrControl+Shift+Enter")})
                                         (cmd-item "Run selection / line" :javascript.run-selection
                                                   {:enabled (.hasEditor js/ltProofUI)
                                                    :accelerator (or (:accelerator (command->menu-binding :eval-editor-form)) "CommandOrControl+Enter")})
                                         (cmd-item "Stop" :eval.cancel-all! {:enabled (or (.isRunning js/ltProofUI) (and (exists? js/ltPreview) (.isRunning js/ltPreview)) (and (exists? js/ltNpmUI) (.isRunning js/ltNpmUI)) (and (exists? js/ltLanguages) (.isRunning js/ltLanguages)))})
                                         {:label "REPL sessions" :submenu [(cmd-item "Connect Python REPL" :repl.python-connect)
                                                                           (cmd-item "Connect Clojure REPL" :repl.clojure-connect)
                                                                           (cmd-item "Connect ClojureScript REPL" :repl.cljs-connect)
                                                                           (cmd-item "Connect external nREPL…" :repl.nrepl-connect)
                                                                           (cmd-item "Connect IPython kernel…" :repl.ipython-connect)
                                                                           (cmd-item "Disconnect REPL sessions" :repl.stop {:enabled (and (exists? js/ltLanguages) (.isRunning js/ltLanguages))})]}
                                         {:type "separator"}
                                         (cmd-item "Automatic live view" :browser.live-toggle {:type "checkbox" :checked (and (exists? js/ltLive) (.enabled js/ltLive))})
                                         (if (and (exists? js/ltLive) (.paused js/ltLive))
                                           (cmd-item "Resume live view" :browser.live-resume)
                                           (cmd-item "Pause live view" :browser.live-pause {:enabled (and (exists? js/ltLive) (.enabled js/ltLive))}))
                                         (cmd-item "Preview file" :browser.preview-file {:enabled (and (exists? js/ltPreview) (.hasFile js/ltPreview))})
                                         (cmd-item "Preview development server" :browser.preview-server {:enabled (and (exists? js/ltPreview) (.hasServer js/ltPreview))})
                                         (cmd-item "Refresh preview" :browser.preview-refresh {:enabled (and (exists? js/ltPreview) (.hasEntry js/ltPreview))})
                                         (cmd-item "Evaluate selection in preview" :browser.preview-selection {:enabled (and (exists? js/ltPreview) (.isRunning js/ltPreview) (.hasWatchEditor js/ltProofUI))})
                                         {:type "separator"}
                                         (cmd-item "Run file with Node" :javascript.run-node {:enabled (.hasNodeFile js/ltProofUI)})
                                         (cmd-item "Install dependencies" :project.install-dependencies {:enabled (and (exists? js/ltNpmUI) (.hasProject js/ltNpmUI) (not (.isRunning js/ltNpmUI)))})
                                         {:label "Development server"
                                          :submenu (if-let [scripts (and (exists? js/ltNpmUI) (seq (js->clj (.scripts js/ltNpmUI))))]
                                                     (mapv (fn [script] {:label script :click (fn [] (cmd/exec! :project.start-development-server script))}) scripts)
                                                     [{:label "No package scripts" :enabled false}])}
                                         (cmd-item "Stop npm operation" :project.stop-npm {:enabled (and (exists? js/ltNpmUI) (.isRunning js/ltNpmUI))})
                                         {:label "npm scripts"
                                          :submenu (if-let [scripts (seq (js->clj (.nodeScripts js/ltProofUI)))]
                                                     (mapv (fn [script] {:label script
                                                                        :click (fn [] (cmd/exec! :javascript.run-script script))}) scripts)
                                                     [{:label "No package scripts" :enabled false}])}
                                         {:type "separator"}
                                         (cmd-item "Clear results" :clear-inline-results {:enabled (.hasEditor js/ltProofUI)})
                                         (cmd-item "Watch selection" :editor.watch.watch-selection {:enabled (.hasWatchEditor js/ltProofUI)})
                                         (cmd-item "Remove watch at cursor" :editor.watch.unwatch {:enabled (.hasWatchEditor js/ltProofUI)})
                                         (cmd-item "Clear watches" :editor.watch.remove-all {:enabled (.hasWatchEditor js/ltProofUI)})
                                         {:type "separator"}
                                         (cmd-item "Connect JavaScript" :javascript.connect
                                                   {:enabled (not (js/lt.objs.clients.javascript.connected_QMARK_))})
                                         (cmd-item "Disconnect JavaScript" :javascript.disconnect
                                                   {:enabled (js/lt.objs.clients.javascript.connected_QMARK_)})
                                         {:type "separator"}
                                         (cmd-item "Evaluate arithmetic" :javascript.arithmetic {:enabled (.hasEditor js/ltProofUI)})]}

                {:label "&View" :submenu [(cmd-item "Workspace" :workspace.show)
                                          (cmd-item "Rainbow parentheses" :editor.rainbow-parens {:type "checkbox" :checked (and (exists? js/ltEditing) (.enabled js/ltEditing))})
                                          (cmd-item "Connections" :show-connect)
                                          (cmd-item "Navigator" :navigate-workspace-transient)
                                          (cmd-item "Commands" :show-commandbar-transient)
                                          (cmd-item "Plugin Manager" :plugin-manager.show)
                                          {:type "separator"}
                                          (cmd-item "Language docs" :docs.search.show)
                                          {:type "separator"}
                                          (cmd-item "Console" :toggle-console)
                                          (cmd-item "Developer Tools" :dev-inspector)]}

                {:label "&Window" :submenu [(cmd-item "Minimize" :window.minimize)
                                            (cmd-item "Maximize" :window.maximize)
                                            (cmd-item "Fullscreen" :window.fullscreen)]}

                {:label "&Help" :submenu [(cmd-item "Documentation" :show-docs)
                                          {:label "Examples" :submenu [(cmd-item "Order report" :javascript.example-report)
                                                                        (cmd-item "Calculation" :javascript.example-calculation)]}
                                          {:label "Report an Issue" :click #(do
                                                                              (cmd/exec! :add-browser-tab "https://github.com/LightTable/LightTable/issues?state=open"))}
                                          (when-not (platform/mac?)
                                            (cmd-item "About Light Table" :version))]}]))

(behavior ::create-menu
          :triggers #{:init}
          :reaction (fn [this]
                      (when (platform/mac?)
                        (set! (.-Menu app/win) nil)
                        )
                      (main-menu)))

(behavior ::recreate-menu
          :debounce 20
          :triggers #{:app.keys.load}
          :reaction (fn [app]
                      (when (platform/mac?)
                        (main-menu))))

(behavior ::set-menu
          :triggers #{:focus}
          :reaction (fn [this]
                      (when (platform/mac?)
                        (main-menu))))

(behavior ::remove-menu-close
          :triggers #{:closed :blur}
          :reaction (fn [this]
                      (when (platform/mac?)
                        (unknown-menu))))

(behavior ::menu!
          :triggers #{:menu!}
          :reaction (fn [this e]
                      (let [items (sort-by :order (filter identity (object/raise-reduce this :menu+ [] e)))]
                        (-> (menu items)
                            (show-menu)))
                      (dom/prevent e)
                      (dom/stop-propagation e)))
