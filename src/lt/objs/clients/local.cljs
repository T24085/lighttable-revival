(ns lt.objs.clients.local
  "Provide local client for connecting to LT"
  (:refer-clojure :exclude [send])
  (:require [cljs.reader :as reader]
            [lt.object :as object]
            [lt.objs.files :as files]
            [lt.objs.clients :as clients]
            [lt.objs.clients.javascript :as javascript]
            [lt.objs.sidebar.clients :as scl]
            [lt.objs.eval :as eval]
            [lt.objs.console :as console]
            [clojure.string :as string]
            [singultus.core :as crate]
            [lt.util.dom :refer [$ append remove]])
  (:use [lt.util.js :only [wait ->clj]])
  (:require-macros [lt.macros :refer [behavior]]))

(def client-name "LightTable-UI")

(defmulti on-message identity)

(defmethod on-message :editor.eval.cljs.exec [_ data cb]
  (doseq [res (:results data)]
    (let [code (:code res)]
      (try
        (object/raise clients/clients :message
                      [cb
                       :editor.eval.cljs.result
                       {:result (eval/cljs-result-format (.call js/eval js/window code))
                        :meta (merge (:meta data) (:meta res))}])
        (catch :default e
          (object/raise clients/clients :message [cb :editor.eval.cljs.exception {:ex e :meta (:meta res)}]))))))

(defn javascript-reply [cb command data]
  (let [[_ callback] (clients/callback? cb)]
    (try
      (object/raise clients/clients :message [cb command data])
      (finally
        (when (fn? callback)
          (swap! clients/callbacks dissoc cb))))))

(defmethod on-message :editor.eval.js [_ data cb]
  (-> (javascript/evaluate (:code data) (clj->js {:path (:path data)}))
      (.then (fn [response]
               (let [result (try
                              (.parse js/JSON (.-result response))
                              (catch :default _ (.-result response)))]
                 (javascript-reply cb :editor.eval.js.result
                                   {:result result :meta (:meta data)
                                    :snapshot (js->clj response :keywordize-keys true)}))))
      (.catch (fn [error]
                (javascript-reply cb :editor.eval.js.exception
                                  {:ex error :meta (:meta data)
                                   :location (js->clj (.-location error) :keywordize-keys true)})))))

(defmethod on-message :editor.eval.css [_ data cb]
  (let [name (str "local-" (string/replace (:name data) #"[^a-zA-Z0-9]+" "-"))
        cur ($ (str "#" name))]
    (when cur
      (remove cur))
    (append ($ :head)
            (crate/html [:style {:type "text/css" :id name} (:code data)]))))

(defmethod on-message :client.close [_ _ _]
  (clients/rem! (clients/by-name client-name)))

(defmethod on-message :default [])

(behavior ::send!
          :triggers #{:send!}
          :reaction (fn [this data]
                      (on-message (keyword (:command data)) (:data data) (:cb data))))

(defn init []
  (clients/handle-connection! {:name client-name
                               :tags [:client.local]
                               :root-relative (files/lt-home "core")
                               :commands #{:editor.eval.cljs.exec
                                           :editor.eval.js
                                           :editor.eval.css}
                               :type "LT-UI"}))

(scl/add-connector {:name "Light Table UI"
                    :desc "Connect to the editor for CSS/ClojureScript UI work. JavaScript uses isolated contexts."
                    :connect (fn []
                               (when-not (clients/by-name client-name)
                                 (init)))})
