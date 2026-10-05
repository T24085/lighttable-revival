(ns lt.objs.editor.file
  "Provide behaviors for a file-based editor object"
  (:require [lt.object :as object]
            [lt.objs.editor :as ed]
            [lt.objs.document :as doc]
            [lt.objs.notifos :as notifos]
            [lt.objs.command :as cmd]
            [clojure.string :as string]
            [lt.objs.files :as files])
  (:require-macros [lt.macros :refer [behavior]]))

(defn save-content! [cm content]
  ;; Save-time whitespace and line-ending changes must keep existing marks,
  ;; inline widgets and multiple selections in the original CodeMirror document.
  (let [before (.getValue cm)
        after (string/replace content "\r\n" "\n")
        old-lines (.split before "\n")
        new-lines (.split after "\n")
        append-line? (and (= (alength new-lines) (inc (alength old-lines)))
                          (= "" (aget new-lines (dec (alength new-lines)))))
        patch (fn [old new from to]
                (let [prefix (loop [n 0]
                               (if (and (< n (count old)) (< n (count new))
                                        (= (.charAt old n) (.charAt new n)))
                                 (recur (inc n)) n))
                      suffix (loop [n 0]
                               (if (and (< n (- (count old) prefix))
                                        (< n (- (count new) prefix))
                                        (= (.charAt old (- (count old) n 1))
                                           (.charAt new (- (count new) n 1))))
                                 (recur (inc n)) n))]
                  (when (not= old new)
                    (.replaceRange cm (.substring new prefix (- (count new) suffix))
                                   (from prefix) (to (- (count old) suffix)) "+save"))))]
    (.operation cm
                (fn []
                  (if (or (= (alength old-lines) (alength new-lines)) append-line?)
                    (do
                      (doseq [line (reverse (range (alength old-lines)))]
                        (patch (aget old-lines line) (aget new-lines line)
                               (fn [ch] #js {:line line :ch ch})
                               (fn [ch] #js {:line line :ch ch})))
                      (when append-line?
                        (.replaceRange cm "\n" (.posFromIndex cm (count (.getValue cm)))
                                       nil "+save")))
                    (patch before after #(.posFromIndex cm %) #(.posFromIndex cm %)))))))

(defn- saved-buffer! [editor content]
  (save-content! (ed/->cm-ed editor) content))

(defn save-to! [editor path write commit & [save-tags]]
  ;; Keep the authored document untouched until disk confirms the write. A
  ;; pending overwrite prompt belongs to this exact editor and source version.
  (let [source (ed/->val editor)
        cm-doc (ed/get-doc editor)
        document (:doc @editor)
        old-path (-> @editor :info :path)
        generation (ed/->generation editor)
        token (js-obj)
        final (if save-tags
                (object/raise-reduce-with-tags editor save-tags :save+ source)
                (object/raise-reduce editor :save+ source))
        current? (fn []
                   (and @editor
                        (identical? token (:save.request @editor))
                        (identical? cm-doc (ed/get-doc editor))
                        (identical? document (:doc @editor))
                        (= old-path (-> @editor :info :path))
                        (not (ed/dirty? editor generation))
                        (= source (ed/->val editor))))]
    (object/merge! editor {:save.request token})
    (write final
           (fn [error]
             (when (and (not error) (current?))
               (when commit (commit final))
               (when (not= final (ed/->val editor))
                 (let [y-position (.-top (.getScrollInfo (ed/->cm-ed editor)))]
                   (saved-buffer! editor final)
                   (ed/scroll-to editor 0 y-position)))
               (object/merge! editor {:dirty false
                                      :editor.generation (ed/->generation editor)})
               (object/raise editor :saved)
               (object/raise editor :clean)))
           current?)))

(behavior ::file-save
          :triggers #{:save}
          :reaction (fn [editor]
                      (let [{:keys [path]} (@editor :info)]
                        (save-to! editor path
                                  (fn [content cb current?]
                                    (doc/save path content cb current?
                                              (fn [resume]
                                                (if (and (exists? js/ltPreview)
                                                         (.-prepareSave js/ltPreview))
                                                  (.prepareSave js/ltPreview editor path content resume)
                                                  (resume nil)))))
                                  nil))))

(behavior ::dirty-on-change
          :throttle 100
          :triggers #{:change :saved}
          :reaction (fn [obj]
                      (let [document (:doc @obj)
                            root (when document (or (:root @document) document))
                            linked? (and root
                                         (or (:root @document)
                                             (> (count (:sub-docs @root)) 1)))
                            normalize #(string/replace % (js/RegExp. "\\r\\n?|\\n" "g") "\n")
                            shared-dirty? (and linked?
                                               (string? (:saved-content @root))
                                               (not= (normalize (doc/->val root))
                                                     (normalize (:saved-content @root))))
                            editors (if linked?
                                      (filter (fn [editor]
                                                (when-let [d (:doc @editor)]
                                                  (identical? root (or (:root @d) d))))
                                              (object/by-tag :editor))
                                      [obj])]
                        ;; Linked documents have independent undo generations.
                        ;; Propagated edits must follow the shared saved source.
                        (doseq [editor editors]
                          (let [dirty? (if (and linked? (string? (:saved-content @root)))
                                         (boolean shared-dirty?)
                                         (ed/dirty? editor (:editor.generation @editor 0)))]
                            (when (and linked? (not dirty?))
                              (object/merge! editor {:editor.generation (ed/->generation editor)}))
                            (when (not= (:dirty @editor) dirty?)
                              (object/merge! editor {:dirty dirty?})
                              (object/raise editor (if dirty? :dirty :clean))))))))

(behavior ::preserve-line-endings
          :triggers #{:save+}
          :reaction (fn [editor content]
                      (if (= "\r\n" (or (-> @editor :info :line-ending) files/line-ending))
                        (string/replace content (js/RegExp. "(\r?\n|\n)" "gm") "\r\n")
                        content)))


(behavior ::remove-trailing-whitespace
          :triggers #{:save+}
          :type :user
          :desc "Save: Remove trailing whitespace"
          :exclusive true
          :reaction (fn [editor content]
                      (.replace content (js/RegExp. "[ \\t]+$" "gm") "")))

(behavior ::last-char-newline
          :desc "Save: Ensure the file ends with a new-line"
          :type :user
          :exclusive true
          :triggers #{:save+}
          :reaction (fn [editor content]
                      (let [line-ending (or (-> @editor :info :line-ending) files/line-ending)]
                        (if (= (last content) "\n")
                          content
                          (str content line-ending)))))

(behavior ::on-save
          :triggers #{:save}
          :type :user
          :desc "Editor: On save execute command"
          :params [{:label "command"}]
          :reaction (fn [this cmd & args]
                      (apply cmd/exec! cmd args)))
