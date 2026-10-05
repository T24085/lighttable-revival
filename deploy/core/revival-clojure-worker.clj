(ns lt.revival.repl
  (:require [clojure.data.json :as json])
  (:import [java.io StringReader StringWriter Writer]
           [clojure.lang LineNumberingPushbackReader]))
(def wire *out*)
(def session-ns (atom (or (find-ns 'user) (create-ns 'user))))
(binding [*ns* @session-ns] (clojure.core/refer 'clojure.core))
(defn send! [value]
  (binding [*out* wire] (println (json/write-str value)) (flush)))
(send! {:ready true :version (clojure-version)})
(doseq [line (line-seq (java.io.BufferedReader. *in*))]
  (let [request (json/read-str line :key-fn keyword)
        output (StringWriter.)
        put! (fn [text]
               (when (> (+ (.length (.getBuffer output)) (count text)) 32768)
                 (throw (ex-info "REPL output exceeds 32 KiB" {})))
               (.write output ^String text))
        limited (proxy [Writer] []
                  (write
                    ([value] (put! (cond (string? value) value
                                        (number? value) (str (char value))
                                        :else (String. ^chars value))))
                    ([buffer offset length]
                     (put! (if (string? buffer)
                             (subs buffer offset (+ offset length))
                             (String. ^chars buffer (int offset) (int length))))))
                  (flush [] nil) (close [] nil))
        reader (LineNumberingPushbackReader. (StringReader. (:source request)))
        eof (Object.)
        response (binding [*ns* @session-ns *file* (:path request)
                           *out* limited *err* limited *read-eval* false]
                   (try
                     (let [value (loop [last-value nil]
                                   (let [form (read {:eof eof :read-cond :allow :features #{:clj}} reader)]
                                     (if (identical? form eof) last-value
                                         (recur (eval form)))))]
                       {:id (:id request) :value (subs (pr-str value) 0 (min 4096 (count (pr-str value))))})
                     (catch Throwable error
                       (let [data (ex-data error)
                             cause (or (.getCause error) error)]
                         {:id (:id request)
                          :error {:message (str (.getSimpleName (class cause)) ": " (.getMessage cause))
                                  :line (or (:clojure.error/line data) (:line data) (.getLineNumber reader) 1)
                                  :column (or (:clojure.error/column data) (:column data) 1)}}))
                     (finally (reset! session-ns *ns*))))]
    (send! (assoc response :logs (str output)))))
