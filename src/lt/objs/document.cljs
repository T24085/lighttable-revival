(ns lt.objs.document
  "Provide document object for wrapping CodeMirror documents. See
  http://codemirror.org/doc/manual.html#api_doc for more"
  (:require [lt.object :as object]
            [lt.objs.files :as files]
            [lt.objs.popup :as popup])
  (:require-macros [lt.macros :refer [behavior defui]])
  (:refer-clojure :exclude [replace]))


;;***************************************************
;; Document
;;***************************************************

(def doc-keys [:line-ending :mime])

(defn create* [info]
  (.Doc js/CodeMirror (:content info) (:mime info)))

(defn ->cm-doc [doc]
  (-> @doc :doc))

(defn linked* [doc info]
  (let [{:keys [from to shared-history type]} info]
    (.linkedDoc (->cm-doc doc) (clj->js {:from from
                                 :to to
                                 :sharedHist shared-history
                                 :mode type}))))

(object/object* ::document
                :sub-docs #{::this}
                :tags #{:document}
                :init (fn [this info]
                        (object/merge! this (merge (dissoc info :content) {:doc (or (:doc info) (create* info))}))
                        nil))


(behavior ::close-document-on-editor-close
          :for #{:editor}
          :triggers #{:closed}
          :reaction (fn [editor]
                      (when-let [doc (:doc @editor)]
                        (object/raise doc :close.force))))

(behavior ::close-linked-document
          :for #{:document}
          :triggers #{:close.force}
          :reaction (fn [this]
                      (when-let [root (:root @this)]
                        (.unlinkDoc (->cm-doc this) (->cm-doc root))
                        (object/update! root [:sub-docs] disj this))
                      (object/destroy! this)))

(behavior ::try-close-root-document
          :for #{:document}
          :triggers #{:try-close}
          :reaction (fn [this]
                      (when (= #{::this} (:sub-docs @this))
                        (object/raise this :close.force))))

(behavior ::close-root-document
          :for #{:document}
          :triggers #{:close.force}
          :reaction (fn [this]
                      (if (and (= #{::this} (:sub-docs @this))
                               (not (object/has-tag? this :document.linked)))
                        (object/destroy! this)
                        (object/update! this [:sub-docs] disj ::this))))

(def default-linked-doc-options {})

(behavior ::set-linked-doc-options
          :triggers #{:object.instant}
          :type :user
          :exclusive true
          :desc "Doc: Set default options for new linked docs"
          :reaction (fn [this opts]
                      (set! default-linked-doc-options opts)))

(defn create [info]
  (object/create ::document info))

(defn create-sub
  ([doc] (create-sub doc nil))
  ([doc info]
   (let [info (merge default-linked-doc-options info)
         neue (create (merge (select-keys @doc doc-keys)
                             info
                             {:doc (linked* doc info) :root doc}))]
     (object/add-tags neue [:document.linked])
     (object/update! doc [:sub-docs] conj neue)
     neue)))

(defn ->snapshot [doc]
  (let [d (->cm-doc doc)
        lines (transient [])]
    (.eachLine d (fn [line]
                   (conj! lines (.-text line))
                   nil))
    {:version (.changeGeneration d)
     :lines (persistent! lines)
     :doc doc}))


(defn latest-snapshot? [snapshot]
  (= (:version snapshot) (-> (:doc snapshot)
                             (->cm-doc)
                             (.changeGeneration))))

(comment
  (def v1 (->snapshot orig))
  (latest-snapshot? v1)

  (set-val orig "hey\nzomg2\n\n\nwoot4\ncool\nlah")
  (def v4 (->snapshot orig))


  (def hist (.getHistory (->cm-doc orig)))

  (-> hist
      (aget "done")
      (aget 0)
      ;(aget "changes")
      ;(aget 0)
      )
  (aget hist "done"))


(defn ->val [doc]
  (.getValue (->cm-doc doc)))

(defn set-val [doc v]
  (.setValue (->cm-doc doc) v))

(defn replace
  ([d from v]
   (.replaceRange (->cm-doc d) v (clj->js from)))
  ([d from to v]
   (.replaceRange (->cm-doc d) v (clj->js from) (clj->js to))))


;;***************************************************
;; Manager
;;***************************************************

(declare manager)

(defn register-doc [doc path]
  (object/update! manager [:files] assoc path doc))

(defn unregister-doc [doc path]
  (when (identical? doc (get-in @manager [:files path]))
    (object/update! manager [:files] dissoc path)))

(defn open [path cb]
  (files/open path (fn [data error]
                     (when data
                       (let [d (create {:content (:content data)
                                      :saved-content (:content data)
                                      :line-ending (:line-ending data)
                                      :mtime (files/stats path)
                                      :mime (:type data)})]
                       (register-doc d path)
                       (when cb
                         (cb d))))) true)
  )

(defn linked-open [ed ldoc-options path cb]
  (files/open path (fn [data]
                     (when data
                       (let [d (create-sub (:doc @ed) ldoc-options)]
                       (when cb
                         (cb d))))) true))

(defn check-mtime [prev updated]
  (cond
    (and (nil? prev) (nil? updated)) true
    (or (nil? prev) (nil? updated)) false
    :else (and (= (.getTime (.-mtime prev)) (.getTime (.-mtime updated)))
               (= (.-size prev) (.-size updated)))))

(defui button [label & [cb]]
       [:div.button.right label]
       :click (fn []
                (when cb
                  (cb))))

(defn overwrite-warn [cb]
  (popup/popup! {:header "This file was modified."
                 :body [:p "It looks like this file was modified outside of Light Table and saving
                  would overwrite those changes. Do you want to overwrite or cancel?"]
                 :buttons [{:label "Overwrite file"
                            :action cb}
                           {:label "Cancel"}]}))

(defn path->doc [path]
  (-> @manager :files (get path)))

(defn ->stats [path]
  (-> (path->doc path) deref :mtime))

(defn update-stats [path]
  (when-let [doc (path->doc path)]
    (object/merge! doc {:mtime (files/stats path)})))

(defn update-saved-content [path content]
  (when-let [doc (path->doc path)]
    (object/merge! doc {:saved-content content})
    (update-stats path)))

(defn move-doc [old neue]
  (when-let [old-d (path->doc old)]
    (object/update! manager [:files] assoc neue old-d)
    (object/update! manager [:files] dissoc old)
    (update-stats neue)))

(defn save* [path content cb]
  (files/save path content (fn [error]
                             (when-not error
                               (update-saved-content path content))
                             (when cb
                               (cb error)))))

(defn- disk-state [path]
  (if-not (files/exists? path)
    {:exists false}
    (let [stat (files/stats path)
          data (when (and stat (.isFile stat)) (files/open-sync path true))]
      (when-not data
        (throw (js/Error. "The saved destination could not be read. No changes were written.")))
      {:exists true :content (:content data)
       :mtime (.getTime (.-mtime stat)) :size (.-size stat)})))

(defn- checked-save [path content cb valid? disk]
  (let [error (try
                (cond
                  (and valid? (not (valid?)))
                  (js/Error. "The editor changed before saving. Save again to save the latest edits.")

                  (not= disk (disk-state path))
                  (js/Error. "The file changed again before saving. Save again to review its latest changes.")

                  :else nil)
                (catch :default error error))]
    ;; A caller's post-write exception is not an I/O failure. Do not catch it
    ;; and invoke that callback again after the destination already committed.
    (if error
      (files/save-error path error cb)
      (save* path content cb))))

(defn save [path content cb & [valid? before-write]]
  (let [prepared (try
                   (let [doc (path->doc path)
                         previous (:mtime @doc)
                         saved-content (:saved-content @doc)
                         disk (disk-state path)]
                     {:disk disk
                      :safe? (and (= (boolean previous) (:exists disk))
                                  (if (some? saved-content)
                                    (= saved-content (:content disk))
                                    (check-mtime previous (files/stats path))))})
                   (catch :default error {:error error}))]
    (if-let [error (:error prepared)]
      (files/save-error path error cb)
      (let [checked-write (fn [finish]
                            (checked-save path content
                                          (fn [error]
                                            (try
                                              (when cb (cb error))
                                              (finally
                                                (when finish (finish)))))
                                          valid? (:disk prepared)))
            write #(if before-write
                     (before-write checked-write)
                     (checked-write nil))]
        (if-not (:safe? prepared)
          (overwrite-warn write)
          (write))))))


(object/object* ::doc-manager
                :triggers []
                :behaviors []
                :files {}
                :init (fn []
                        ))

(def manager (object/create ::doc-manager))
