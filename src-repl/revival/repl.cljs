(ns revival.repl
  (:require [cljs.js :as compiler]
            [cljs.tools.reader :as reader]
            [cljs.tools.reader.reader-types :as reader-types]
            [cljs.tagged-literals :as tags]
            [clojure.string :as string]))

(def state (compiler/empty-state))
(def current-ns (atom 'cljs.user))
(def output (atom ""))
(def wire (.-stdout js/process))
(def fs (js/require "fs"))
(def paths (js/require "path"))
(defn send! [value] (.write wire (str (.stringify js/JSON (clj->js value)) "\n")))
(defn print! [value]
  (let [next (str @output value)]
    (when (> (count next) 32768) (throw (js/Error. "REPL output exceeds 32 KiB")))
    (reset! output next)))
(set! *print-fn* print!)
(set! *print-err-fn* print!)
(defn error-message [error]
  (loop [cause error depth 0]
    (if (and (< depth 8) (ex-cause cause))
      (recur (ex-cause cause) (inc depth))
      (or (.-message cause) (str cause)))))
(defn error-location [error]
  (loop [cause error depth 0]
    (let [data (ex-data cause)]
      (cond (:line data) {:line (max 1 (:line data)) :column (or (:column data) 1)}
            (and (< depth 8) (ex-cause cause)) (recur (ex-cause cause) (inc depth))
            :else {:line 1 :column 1}))))
(defn load-source [request info callback]
  (try
    (let [relative (string/replace (str (:name info)) "." "/")
          root (.resolve paths (.-root request))
          candidates (for [directory [root (.join paths root "src")]
                           extension (if (:macros info) [".cljc" ".cljs"] [".cljs" ".cljc"])]
                       (.resolve paths directory (str relative extension)))
          file (first (filter #(.existsSync fs %) candidates))]
      (if file
        (let [real (.realpathSync fs file)
              location (.relative paths root real)]
          (when (or (.isAbsolute paths location) (= location "..") (string/starts-with? location (str ".." (.-sep paths))))
            (throw (js/Error. "REPL namespace resolves outside its project")))
          (when (> (.-size (.statSync fs real)) 2097152)
            (throw (js/Error. "REPL namespace source exceeds 2 MiB")))
          (callback {:lang :clj :source (.readFileSync fs real "utf8")}))
        (callback {:error (js/Error. (str "Namespace " (:name info) " was not found in the project. JVM-only macros require a JVM build."))})))
    (catch :default error (callback {:error error}))))
(defn evaluate! [request]
  (reset! output "")
  (let [source (.-source request)
        stream (reader-types/source-logging-push-back-reader source)
        eof (js-obj) offset (atom 0)
        failure (fn [error] (send! {:id (.-id request) :logs @output
                                   :error (assoc (error-location error) :message (error-message error))}))]
    (letfn [(step [last-value]
              (try
                (let [aliases (merge (get-in @state [:cljs.analyzer/namespaces @current-ns :requires])
                                     (get-in @state [:cljs.analyzer/namespaces @current-ns :require-macros]))
                      [form snippet] (binding [*ns* @current-ns reader/*alias-map* aliases
                                               reader/*data-readers* tags/*cljs-data-readers*]
                                       (reader/read+string {:eof eof :read-cond :allow :features #{:cljs}} stream))]
                  (if (identical? form eof)
                    (send! {:id (.-id request) :logs @output
                            :value (subs (pr-str last-value) 0 (min 4096 (count (pr-str last-value))))})
                    (let [position (.indexOf source snippet @offset)
                          line (if (neg? position) (max 0 (dec (or (:line (meta form)) 1)))
                                   (count (re-seq #"\r\n|\r|\n" (.substring source 0 position))))
                          padded (str (apply str (repeat line "\n")) snippet)]
                      (when-not (neg? position) (reset! offset (+ position (count snippet))))
                      (compiler/eval-str state padded (.-path request)
                        {:eval compiler/js-eval :ns @current-ns :context :expr :def-emits-var true
                         :load (partial load-source request)}
                        (fn [{:keys [value error ns]}]
                          (when ns (reset! current-ns ns))
                          (if error (failure error) (js/setImmediate #(step value))))))))
                (catch :default error (failure error))))]
      (step nil))))
(defn main []
  (set! (.-cljs js/global) js/cljs)
  (set! (.-clojure js/global) js/clojure)
  (set! (.-user js/cljs) #js {})
  (let [reader ((.-createInterface (js/require "readline")) #js {:input (.-stdin js/process)})]
    (.on reader "line" (fn [line]
      (try (evaluate! (.parse js/JSON line))
           (catch :default error (send! {:id (.-id (.parse js/JSON line))
                                        :error {:message (.-message error) :line 1 :column 1}})))))
  (compiler/eval-str state "(ns cljs.user)" "Light Table REPL"
    {:eval compiler/js-eval :context :expr}
    (fn [{:keys [error]}]
      (send! (if error {:fatal (error-message error)}
                      {:ready true :version "ClojureScript 1.10.844 (Node)"}))))))
(set! *main-cli-fn* main)
