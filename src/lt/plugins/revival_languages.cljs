(ns lt.plugins.revival-languages
  (:require [lt.objs.command :as cmd]))
(cmd/command {:command :repl.python-connect :desc "REPL: Connect local Python"
              :exec #(.connect js/ltLanguages "python")})
(cmd/command {:command :repl.clojure-connect :desc "REPL: Connect local Clojure"
              :exec #(.connect js/ltLanguages "clojure")})
(cmd/command {:command :repl.cljs-connect :desc "REPL: Connect local ClojureScript"
              :exec #(.connect js/ltLanguages "clojurescript")})
(cmd/command {:command :repl.nrepl-connect :desc "REPL: Connect external nREPL"
              :exec #(.nrepl js/ltLanguages)})
(cmd/command {:command :repl.ipython-connect :desc "REPL: Connect IPython kernel"
              :exec #(.ipython js/ltLanguages)})
(cmd/command {:command :repl.stop :desc "REPL: Disconnect sessions"
              :exec #(.stop js/ltLanguages)})
