(ns lt.objs.clients.javascript
  "JavaScript client backed by the main-process isolated execution bridge."
  (:require [lt.object :as object]
            [lt.objs.clients :as clients]
            [lt.objs.editor.pool :as pool]
            [lt.objs.editor :as editor]
            [lt.objs.sidebar.clients :as sidebar]
            [lt.objs.command :as cmd])
  (:require-macros [lt.macros :refer [behavior]]))

(def client-name "JavaScript")

(defn reply! [message command data]
  (try
    (clients/call (:cb message) command data)
    (finally
      ;; These requests have one terminal reply; release their callback closure.
      (swap! clients/callbacks dissoc (:cb message)))))

(defn refresh-menus []
  (when (exists? js/ltProofUI)
    (.refreshMenus js/ltProofUI true)))

(behavior ::send!
          :triggers #{:send!}
          :reaction
          (fn [this message]
            (case (keyword (:command message))
              :javascript.eval
              (try
                (let [{:keys [source options]} (:data message)]
                  (-> (.run js/ltProjectFiles source (clj->js options))
                      (.then (fn [response]
                               (if (.-failed response)
                                 (reply! message :javascript.error
                                         (js->clj (.-error response) :keywordize-keys true))
                                 (reply! message :javascript.result
                                         (js->clj response :keywordize-keys true)))))
                      (.catch (fn [error]
                                (reply! message :javascript.error {:message (.-message error)})))))
                (catch :default error
                  (reply! message :javascript.error {:message (.-message error)})))
              :client.cancel-all
              (do (.stop js/ltProofUI)
                  (reply! message :javascript.cancelled {}))
              :client.close
              (reply! message :javascript.closed {})
              (reply! message :javascript.error {:message "Unsupported JavaScript client command."}))))

(behavior ::close!
          :triggers #{:close!}
          :reaction
          (fn [this]
            (.stop js/ltProofUI)
            (doseq [editor (object/by-tag :editor)]
              (when (= this (get-in @editor [:client :javascript]))
                (object/update! editor [:client] dissoc :javascript)
                (object/raise editor :set-client nil)))
            (clients/rem! this)
            (refresh-menus)))

(defn connected? []
  (boolean (when-let [client (clients/by-name client-name)]
             (:connected @client))))

(defn connect! []
  (or (when-let [client (clients/by-name client-name)]
        (when (:connected @client) client))
      (let [client (clients/client! :client.javascript)]
        (object/add-behavior! client ::send!)
        (object/add-behavior! client ::close!)
        (clients/handle-connection!
         {:client-id (object/->id client)
          :name client-name
          :type "Local JavaScript (fresh context per run)"
          :commands [:javascript.eval :client.cancel-all :client.close]})
        (refresh-menus)
        client)))

(defn disconnect! []
  (when-let [client (clients/by-name client-name)]
    (clients/close! client)))

(defn evaluate [source options]
  (js/Promise.
   (fn [resolve reject]
     (let [client (connect!)]
       (when-let [target (or (object/by-id (.-editorId options)) (pool/last-active))]
         (object/update! target [:client] assoc :javascript client)
         (object/raise target :set-client client))
       (clients/send client :javascript.eval
                     {:source source :options (js->clj options :keywordize-keys true)}
                     true
                     (fn [command data]
                       (if (= command :javascript.result)
                         (resolve (clj->js data))
                         (let [error (js/Error. (:message data))]
                           (set! (.-location error) (clj->js (:location data)))
                           (set! (.-logs error) (clj->js (:logs data)))
                           (reject error)))))))))

(defn watch-specs [target]
  (clj->js
   (vec (for [[id {:keys [mark]}] (:watches @target)
              :let [position (.find mark)]
              :when position]
          (merge {:id id
                  :from (.indexFromPos (editor/->cm-ed target) (.-from position))
                  :to (.indexFromPos (editor/->cm-ed target) (.-to position))}
                 (when-let [expression (:exp (.-custom mark))]
                   {:expression expression}))))))

(defn watch-status! [target status values version]
  (let [results (into {} (map (juxt :id :result) (js->clj values :keywordize-keys true)))]
    (doseq [[id {:keys [inline-result]}] (:watches @target)
            :let [fresh (get results id)
                  result (if (= status "current") (or fresh "Not reached in this run") (or fresh (:result @inline-result) "Not evaluated"))
                  display (str (case status "stale" "STALE: " "failed" "FAILED: " "running" "RUNNING: " "cancelled" "STOPPED: " "") result)
                  content (object/->content inline-result)]]
      (object/merge! inline-result {:result result :watch-status status})
      (doseq [selector [".full" ".truncated"]
              :let [node (.querySelector content selector)]
              :when node]
        (set! (.-textContent node) (if (= selector ".truncated") (subs display 0 (min 60 (count display))) display)))
      (set! (.-status (.-dataset content)) status)
      (set! (.-title content) (str "Watch " id " | code v" (inc (or version 0))))
      (object/raise inline-result :changed))))

(behavior ::editor-context
          :triggers #{:object.instant}
          :reaction (fn [target]
                      (object/add-tags target [:watchable :editor.inline-result])))

(behavior ::editor-eval
          :triggers #{:eval}
          :reaction (fn [target]
                      (.runEditor js/ltProofUI target "file")))

(behavior ::editor-eval-one
          :triggers #{:eval.one}
          :reaction (fn [target]
                      (when-not (:javascript-clearing @target)
                        (.runEditor js/ltProofUI target (if (seq (:watches @target)) "file" "selection")))))

(sidebar/add-connector {:name "JavaScript"
                        :desc "Run JavaScript with fresh contexts, project modules and explicit Node/npm execution."
                        :connect connect!})

(cmd/command {:command :javascript.connect
              :desc "Run: Connect JavaScript"
              :exec connect!})

(cmd/command {:command :javascript.disconnect
              :desc "Run: Disconnect JavaScript"
              :exec disconnect!})
