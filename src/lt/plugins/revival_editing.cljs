(ns lt.plugins.revival-editing
  (:require [lt.objs.command :as cmd]
            [lt.objs.editor :as editor])
  (:require-macros [lt.macros :refer [behavior]]))

(behavior ::html-tag-tools
          :triggers #{:object.instant}
          :reaction (fn [this]
                      (editor/set-options this {:autoCloseTags true
                                                :matchTags (js-obj "bothTags" true)})))

(cmd/command {:command :editor.rainbow-parens
              :desc "Editor: Toggle rainbow parentheses"
              :exec #(.toggle js/ltEditing)})

(cmd/command {:command :html.jump-to-matching-tag
              :desc "HTML: Jump to matching tag"
              :exec #(.matchingTag js/ltEditing)})
