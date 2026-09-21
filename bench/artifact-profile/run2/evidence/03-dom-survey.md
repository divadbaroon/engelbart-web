# The same page, as the collector describes it

The collector walks the document keeping the elements it considers worth
pointing at, and describes each one with the fields a rule can be written
against. These are those descriptions, at four moments of the interface's life.
`parent` is the `ord` of the nearest kept ancestor.

**The walk stops after 120 elements.** Every one of these four surveys is
truncated — the counts below say which tags the 120 were spent on. Read this
file for the *shape of a description*, and `02-raw-dom.md` for what the document
actually contains.

## 01-on-load — 120 elements, truncated: true

tags: tspan×40, g×22, rect×21, text×20, div×13, canvas×3, svg×1

```
  1  parent=  -  <div> id="app" text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app
  2  parent=  1  <div> classes=["stand-alone-page"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page
  3  parent=  2  <div> classes=["mapview-page","s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF
  4  parent=  3  <div> id="popper-tooltip-top" role="tooltip" classes=["s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-top
  5  parent=  4  <div> classes=["popper-arrow","s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-top > div.popper-arrow.s-n1WHAIkRHwGF
  6  parent=  3  <div> id="popper-tooltip-bottom" role="tooltip" classes=["s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-bottom
  7  parent=  6  <div> classes=["popper-arrow","s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-bottom > div.popper-arrow.s-n1WHAIkRHwGF
  8  parent=  3  <div> classes=["s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3)
  9  parent=  8  <div> classes=["main-app","s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF
 10  parent=  9  <div> classes=["s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF
 11  parent= 10  <div> classes=["s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET
 12  parent= 11  <div> classes=["s-ovhWPbaoO3ET"]
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.s-ovhWPbaoO3ET:nth-of-type(1)
 13  parent= 11  <div> classes=["embedding","s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2)
 14  parent= 13  <svg> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1)
 15  parent= 14  <rect> classes=["mouse-track-rect"]
       selector: div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > rect.mouse-track-rect
 16  parent= 14  <g> classes=["topics"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2)
 17  parent= 16  <g> classes=["zoom-6"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6
 18  parent= 17  <g> classes=["label-group","zoom-6"] text="summarization-document- summaries-summary"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1)
 19  parent= 18  <text> classes=["topic-label"] text="summarization-document- summaries-summary"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label
 20  parent= 19  <tspan> classes=["line-1"] text="summarization-document-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label > tspan.line-1:nth-of-type(1)
 21  parent= 19  <tspan> classes=["line-2"] text="summaries-summary"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label > tspan.line-2:nth-of-type(2)
 22  parent= 18  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > rect.topic-tile
 23  parent= 17  <g> classes=["label-group","zoom-6"] text="question-answer- answering-qa"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2)
 24  parent= 23  <text> classes=["topic-label"] text="question-answer- answering-qa"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label
 25  parent= 24  <tspan> classes=["line-1"] text="question-answer-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label > tspan.line-1:nth-of-type(1)
 26  parent= 24  <tspan> classes=["line-2"] text="answering-qa"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label > tspan.line-2:nth-of-type(2)
 27  parent= 23  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > rect.topic-tile
 28  parent= 17  <g> classes=["label-group","zoom-6"] text="sentiment-analysis- classification-polarity"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3)
 29  parent= 28  <text> classes=["topic-label"] text="sentiment-analysis- classification-polarity"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label
 30  parent= 29  <tspan> classes=["line-1"] text="sentiment-analysis-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label > tspan.line-1:nth-of-type(1)
 31  parent= 29  <tspan> classes=["line-2"] text="classification-polarity"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label > tspan.line-2:nth-of-type(2)
 32  parent= 28  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > rect.topic-tile
 33  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-machine- neural-nmt"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4)
 34  parent= 33  <text> classes=["topic-label"] text="translation-machine- neural-nmt"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label
 35  parent= 34  <tspan> classes=["line-1"] text="translation-machine-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label > tspan.line-1:nth-of-type(1)
 36  parent= 34  <tspan> classes=["line-2"] text="neural-nmt"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label > tspan.line-2:nth-of-type(2)
 37  parent= 33  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > rect.topic-tile
 38  parent= 17  <g> classes=["label-group","zoom-6"] text="generation-text- language-model"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5)
 39  parent= 38  <text> classes=["topic-label"] text="generation-text- language-model"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label
 40  parent= 39  <tspan> classes=["line-1"] text="generation-text-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label > tspan.line-1:nth-of-type(1)
 41  parent= 39  <tspan> classes=["line-2"] text="language-model"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label > tspan.line-2:nth-of-type(2)
 42  parent= 38  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > rect.topic-tile
 43  parent= 17  <g> classes=["label-group","zoom-6"] text="parsing-dependency- parser-treebank"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6)
 44  parent= 43  <text> classes=["topic-label"] text="parsing-dependency- parser-treebank"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label
 45  parent= 44  <tspan> classes=["line-1"] text="parsing-dependency-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label > tspan.line-1:nth-of-type(1)
 46  parent= 44  <tspan> classes=["line-2"] text="parser-treebank"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label > tspan.line-2:nth-of-type(2)
 47  parent= 43  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > rect.topic-tile
 48  parent= 17  <g> classes=["label-group","zoom-6"] text="relation-extraction- relations-knowledge"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7)
 49  parent= 48  <text> classes=["topic-label"] text="relation-extraction- relations-knowledge"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label
 50  parent= 49  <tspan> classes=["line-1"] text="relation-extraction-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label > tspan.line-1:nth-of-type(1)
 51  parent= 49  <tspan> classes=["line-2"] text="relations-knowledge"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label > tspan.line-2:nth-of-type(2)
 52  parent= 48  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > rect.topic-tile
 53  parent= 17  <g> classes=["label-group","zoom-6"] text="hate-language- speech-detection"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8)
 54  parent= 53  <text> classes=["topic-label"] text="hate-language- speech-detection"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label
 55  parent= 54  <tspan> classes=["line-1"] text="hate-language-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label > tspan.line-1:nth-of-type(1)
 56  parent= 54  <tspan> classes=["line-2"] text="speech-detection"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label > tspan.line-2:nth-of-type(2)
 57  parent= 53  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > rect.topic-tile
 58  parent= 17  <g> classes=["label-group","zoom-6"] text="sense-word- disambiguation-wsd"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9)
 59  parent= 58  <text> classes=["topic-label"] text="sense-word- disambiguation-wsd"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label
 60  parent= 59  <tspan> classes=["line-1"] text="sense-word-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label > tspan.line-1:nth-of-type(1)
 61  parent= 59  <tspan> classes=["line-2"] text="disambiguation-wsd"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label > tspan.line-2:nth-of-type(2)
 62  parent= 58  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > rect.topic-tile
 63  parent= 17  <g> classes=["label-group","zoom-6"] text="clinical-medical- text-task"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10)
 64  parent= 63  <text> classes=["topic-label"] text="clinical-medical- text-task"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label
 65  parent= 64  <tspan> classes=["line-1"] text="clinical-medical-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label > tspan.line-1:nth-of-type(1)
 66  parent= 64  <tspan> classes=["line-2"] text="text-task"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label > tspan.line-2:nth-of-type(2)
 67  parent= 63  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > rect.topic-tile
 68  parent= 17  <g> classes=["label-group","zoom-6"] text="entity-named- ner-recognition"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11)
 69  parent= 68  <text> classes=["topic-label"] text="entity-named- ner-recognition"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label
 70  parent= 69  <tspan> classes=["line-1"] text="entity-named-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label > tspan.line-1:nth-of-type(1)
 71  parent= 69  <tspan> classes=["line-2"] text="ner-recognition"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label > tspan.line-2:nth-of-type(2)
 72  parent= 68  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > rect.topic-tile
 73  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-machine- based-statistical"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12)
 74  parent= 73  <text> classes=["topic-label"] text="translation-machine- based-statistical"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label
 75  parent= 74  <tspan> classes=["line-1"] text="translation-machine-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label > tspan.line-1:nth-of-type(1)
 76  parent= 74  <tspan> classes=["line-2"] text="based-statistical"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label > tspan.line-2:nth-of-type(2)
 77  parent= 73  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > rect.topic-tile
 78  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-based- machine-model"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13)
 79  parent= 78  <text> classes=["topic-label"] text="translation-based- machine-model"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label
 80  parent= 79  <tspan> classes=["line-1"] text="translation-based-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label > tspan.line-1:nth-of-type(1)
 81  parent= 79  <tspan> classes=["line-2"] text="machine-model"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label > tspan.line-2:nth-of-type(2)
 82  parent= 78  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > rect.topic-tile
 83  parent= 17  <g> classes=["label-group","zoom-6"] text="discourse-parsing- text-task"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14)
 84  parent= 83  <text> classes=["topic-label"] text="discourse-parsing- text-task"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label
 85  parent= 84  <tspan> classes=["line-1"] text="discourse-parsing-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label > tspan.line-1:nth-of-type(1)
 86  parent= 84  <tspan> classes=["line-2"] text="text-task"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label > tspan.line-2:nth-of-type(2)
 87  parent= 83  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > rect.topic-tile
 88  parent= 17  <g> classes=["label-group","zoom-6"] text="semantic-role- labeling-srl"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15)
 89  parent= 88  <text> classes=["topic-label"] text="semantic-role- labeling-srl"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label
 90  parent= 89  <tspan> classes=["line-1"] text="semantic-role-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label > tspan.line-1:nth-of-type(1)
 91  parent= 89  <tspan> classes=["line-2"] text="labeling-srl"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label > tspan.line-2:nth-of-type(2)
 92  parent= 88  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > rect.topic-tile
 93  parent= 17  <g> classes=["label-group","zoom-6"] text="task-language- offensive-detection"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16)
 94  parent= 93  <text> classes=["topic-label"] text="task-language- offensive-detection"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label
 95  parent= 94  <tspan> classes=["line-1"] text="task-language-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label > tspan.line-1:nth-of-type(1)
 96  parent= 94  <tspan> classes=["line-2"] text="offensive-detection"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label > tspan.line-2:nth-of-type(2)
 97  parent= 93  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > rect.topic-tile
 98  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-mt- language-machine"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17)
 99  parent= 98  <text> classes=["topic-label"] text="translation-mt- language-machine"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label
100  parent= 99  <tspan> classes=["line-1"] text="translation-mt-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label > tspan.line-1:nth-of-type(1)
101  parent= 99  <tspan> classes=["line-2"] text="language-machine"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label > tspan.line-2:nth-of-type(2)
102  parent= 98  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > rect.topic-tile
103  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-mt- speech-machine"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18)
104  parent=103  <text> classes=["topic-label"] text="translation-mt- speech-machine"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label
105  parent=104  <tspan> classes=["line-1"] text="translation-mt-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label > tspan.line-1:nth-of-type(1)
106  parent=104  <tspan> classes=["line-2"] text="speech-machine"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label > tspan.line-2:nth-of-type(2)
107  parent=103  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > rect.topic-tile
108  parent= 17  <g> classes=["label-group","zoom-6"] text="metaphor-metaphors- language-metaphorical"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19)
109  parent=108  <text> classes=["topic-label"] text="metaphor-metaphors- language-metaphorical"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label
110  parent=109  <tspan> classes=["line-1"] text="metaphor-metaphors-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label > tspan.line-1:nth-of-type(1)
111  parent=109  <tspan> classes=["line-2"] text="language-metaphorical"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label > tspan.line-2:nth-of-type(2)
112  parent=108  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > rect.topic-tile
113  parent= 17  <g> classes=["label-group","zoom-6"] text="speech-recognition- model-language"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20)
114  parent=113  <text> classes=["topic-label"] text="speech-recognition- model-language"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label
115  parent=114  <tspan> classes=["line-1"] text="speech-recognition-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label > tspan.line-1:nth-of-type(1)
116  parent=114  <tspan> classes=["line-2"] text="model-language"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label > tspan.line-2:nth-of-type(2)
117  parent=113  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > rect.topic-tile
118  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET:nth-of-type(1)
119  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET","faded"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET.faded:nth-of-type(2)
120  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET:nth-of-type(4)
```

## 02-label-menu-open — 120 elements, truncated: true

tags: tspan×40, g×22, rect×21, text×20, div×13, canvas×3, svg×1

```
  1  parent=  -  <div> id="app" text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app
  2  parent=  1  <div> classes=["stand-alone-page"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page
  3  parent=  2  <div> classes=["mapview-page","s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF
  4  parent=  3  <div> id="popper-tooltip-top" role="tooltip" classes=["s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-top
  5  parent=  4  <div> classes=["popper-arrow","s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-top > div.popper-arrow.s-n1WHAIkRHwGF
  6  parent=  3  <div> id="popper-tooltip-bottom" role="tooltip" classes=["s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-bottom
  7  parent=  6  <div> classes=["popper-arrow","s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-bottom > div.popper-arrow.s-n1WHAIkRHwGF
  8  parent=  3  <div> classes=["s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3)
  9  parent=  8  <div> classes=["main-app","s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF
 10  parent=  9  <div> classes=["s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF
 11  parent= 10  <div> classes=["s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET
 12  parent= 11  <div> classes=["s-ovhWPbaoO3ET"]
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.s-ovhWPbaoO3ET:nth-of-type(1)
 13  parent= 11  <div> classes=["embedding","s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2)
 14  parent= 13  <svg> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1)
 15  parent= 14  <rect> classes=["mouse-track-rect"]
       selector: div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > rect.mouse-track-rect
 16  parent= 14  <g> classes=["topics"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2)
 17  parent= 16  <g> classes=["zoom-6"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6
 18  parent= 17  <g> classes=["label-group","zoom-6"] text="summarization-document- summaries-summary"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1)
 19  parent= 18  <text> classes=["topic-label"] text="summarization-document- summaries-summary"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label
 20  parent= 19  <tspan> classes=["line-1"] text="summarization-document-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label > tspan.line-1:nth-of-type(1)
 21  parent= 19  <tspan> classes=["line-2"] text="summaries-summary"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label > tspan.line-2:nth-of-type(2)
 22  parent= 18  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > rect.topic-tile
 23  parent= 17  <g> classes=["label-group","zoom-6"] text="question-answer- answering-qa"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2)
 24  parent= 23  <text> classes=["topic-label"] text="question-answer- answering-qa"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label
 25  parent= 24  <tspan> classes=["line-1"] text="question-answer-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label > tspan.line-1:nth-of-type(1)
 26  parent= 24  <tspan> classes=["line-2"] text="answering-qa"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label > tspan.line-2:nth-of-type(2)
 27  parent= 23  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > rect.topic-tile
 28  parent= 17  <g> classes=["label-group","zoom-6"] text="sentiment-analysis- classification-polarity"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3)
 29  parent= 28  <text> classes=["topic-label"] text="sentiment-analysis- classification-polarity"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label
 30  parent= 29  <tspan> classes=["line-1"] text="sentiment-analysis-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label > tspan.line-1:nth-of-type(1)
 31  parent= 29  <tspan> classes=["line-2"] text="classification-polarity"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label > tspan.line-2:nth-of-type(2)
 32  parent= 28  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > rect.topic-tile
 33  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-machine- neural-nmt"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4)
 34  parent= 33  <text> classes=["topic-label"] text="translation-machine- neural-nmt"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label
 35  parent= 34  <tspan> classes=["line-1"] text="translation-machine-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label > tspan.line-1:nth-of-type(1)
 36  parent= 34  <tspan> classes=["line-2"] text="neural-nmt"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label > tspan.line-2:nth-of-type(2)
 37  parent= 33  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > rect.topic-tile
 38  parent= 17  <g> classes=["label-group","zoom-6"] text="generation-text- language-model"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5)
 39  parent= 38  <text> classes=["topic-label"] text="generation-text- language-model"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label
 40  parent= 39  <tspan> classes=["line-1"] text="generation-text-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label > tspan.line-1:nth-of-type(1)
 41  parent= 39  <tspan> classes=["line-2"] text="language-model"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label > tspan.line-2:nth-of-type(2)
 42  parent= 38  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > rect.topic-tile
 43  parent= 17  <g> classes=["label-group","zoom-6"] text="parsing-dependency- parser-treebank"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6)
 44  parent= 43  <text> classes=["topic-label"] text="parsing-dependency- parser-treebank"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label
 45  parent= 44  <tspan> classes=["line-1"] text="parsing-dependency-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label > tspan.line-1:nth-of-type(1)
 46  parent= 44  <tspan> classes=["line-2"] text="parser-treebank"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label > tspan.line-2:nth-of-type(2)
 47  parent= 43  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > rect.topic-tile
 48  parent= 17  <g> classes=["label-group","zoom-6"] text="relation-extraction- relations-knowledge"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7)
 49  parent= 48  <text> classes=["topic-label"] text="relation-extraction- relations-knowledge"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label
 50  parent= 49  <tspan> classes=["line-1"] text="relation-extraction-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label > tspan.line-1:nth-of-type(1)
 51  parent= 49  <tspan> classes=["line-2"] text="relations-knowledge"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label > tspan.line-2:nth-of-type(2)
 52  parent= 48  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > rect.topic-tile
 53  parent= 17  <g> classes=["label-group","zoom-6"] text="hate-language- speech-detection"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8)
 54  parent= 53  <text> classes=["topic-label"] text="hate-language- speech-detection"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label
 55  parent= 54  <tspan> classes=["line-1"] text="hate-language-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label > tspan.line-1:nth-of-type(1)
 56  parent= 54  <tspan> classes=["line-2"] text="speech-detection"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label > tspan.line-2:nth-of-type(2)
 57  parent= 53  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > rect.topic-tile
 58  parent= 17  <g> classes=["label-group","zoom-6"] text="sense-word- disambiguation-wsd"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9)
 59  parent= 58  <text> classes=["topic-label"] text="sense-word- disambiguation-wsd"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label
 60  parent= 59  <tspan> classes=["line-1"] text="sense-word-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label > tspan.line-1:nth-of-type(1)
 61  parent= 59  <tspan> classes=["line-2"] text="disambiguation-wsd"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label > tspan.line-2:nth-of-type(2)
 62  parent= 58  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > rect.topic-tile
 63  parent= 17  <g> classes=["label-group","zoom-6"] text="clinical-medical- text-task"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10)
 64  parent= 63  <text> classes=["topic-label"] text="clinical-medical- text-task"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label
 65  parent= 64  <tspan> classes=["line-1"] text="clinical-medical-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label > tspan.line-1:nth-of-type(1)
 66  parent= 64  <tspan> classes=["line-2"] text="text-task"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label > tspan.line-2:nth-of-type(2)
 67  parent= 63  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > rect.topic-tile
 68  parent= 17  <g> classes=["label-group","zoom-6"] text="entity-named- ner-recognition"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11)
 69  parent= 68  <text> classes=["topic-label"] text="entity-named- ner-recognition"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label
 70  parent= 69  <tspan> classes=["line-1"] text="entity-named-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label > tspan.line-1:nth-of-type(1)
 71  parent= 69  <tspan> classes=["line-2"] text="ner-recognition"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label > tspan.line-2:nth-of-type(2)
 72  parent= 68  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > rect.topic-tile
 73  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-machine- based-statistical"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12)
 74  parent= 73  <text> classes=["topic-label"] text="translation-machine- based-statistical"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label
 75  parent= 74  <tspan> classes=["line-1"] text="translation-machine-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label > tspan.line-1:nth-of-type(1)
 76  parent= 74  <tspan> classes=["line-2"] text="based-statistical"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label > tspan.line-2:nth-of-type(2)
 77  parent= 73  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > rect.topic-tile
 78  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-based- machine-model"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13)
 79  parent= 78  <text> classes=["topic-label"] text="translation-based- machine-model"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label
 80  parent= 79  <tspan> classes=["line-1"] text="translation-based-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label > tspan.line-1:nth-of-type(1)
 81  parent= 79  <tspan> classes=["line-2"] text="machine-model"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label > tspan.line-2:nth-of-type(2)
 82  parent= 78  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > rect.topic-tile
 83  parent= 17  <g> classes=["label-group","zoom-6"] text="discourse-parsing- text-task"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14)
 84  parent= 83  <text> classes=["topic-label"] text="discourse-parsing- text-task"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label
 85  parent= 84  <tspan> classes=["line-1"] text="discourse-parsing-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label > tspan.line-1:nth-of-type(1)
 86  parent= 84  <tspan> classes=["line-2"] text="text-task"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label > tspan.line-2:nth-of-type(2)
 87  parent= 83  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > rect.topic-tile
 88  parent= 17  <g> classes=["label-group","zoom-6"] text="semantic-role- labeling-srl"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15)
 89  parent= 88  <text> classes=["topic-label"] text="semantic-role- labeling-srl"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label
 90  parent= 89  <tspan> classes=["line-1"] text="semantic-role-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label > tspan.line-1:nth-of-type(1)
 91  parent= 89  <tspan> classes=["line-2"] text="labeling-srl"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label > tspan.line-2:nth-of-type(2)
 92  parent= 88  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > rect.topic-tile
 93  parent= 17  <g> classes=["label-group","zoom-6"] text="task-language- offensive-detection"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16)
 94  parent= 93  <text> classes=["topic-label"] text="task-language- offensive-detection"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label
 95  parent= 94  <tspan> classes=["line-1"] text="task-language-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label > tspan.line-1:nth-of-type(1)
 96  parent= 94  <tspan> classes=["line-2"] text="offensive-detection"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label > tspan.line-2:nth-of-type(2)
 97  parent= 93  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > rect.topic-tile
 98  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-mt- language-machine"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17)
 99  parent= 98  <text> classes=["topic-label"] text="translation-mt- language-machine"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label
100  parent= 99  <tspan> classes=["line-1"] text="translation-mt-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label > tspan.line-1:nth-of-type(1)
101  parent= 99  <tspan> classes=["line-2"] text="language-machine"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label > tspan.line-2:nth-of-type(2)
102  parent= 98  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > rect.topic-tile
103  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-mt- speech-machine"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18)
104  parent=103  <text> classes=["topic-label"] text="translation-mt- speech-machine"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label
105  parent=104  <tspan> classes=["line-1"] text="translation-mt-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label > tspan.line-1:nth-of-type(1)
106  parent=104  <tspan> classes=["line-2"] text="speech-machine"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label > tspan.line-2:nth-of-type(2)
107  parent=103  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > rect.topic-tile
108  parent= 17  <g> classes=["label-group","zoom-6"] text="metaphor-metaphors- language-metaphorical"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19)
109  parent=108  <text> classes=["topic-label"] text="metaphor-metaphors- language-metaphorical"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label
110  parent=109  <tspan> classes=["line-1"] text="metaphor-metaphors-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label > tspan.line-1:nth-of-type(1)
111  parent=109  <tspan> classes=["line-2"] text="language-metaphorical"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label > tspan.line-2:nth-of-type(2)
112  parent=108  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > rect.topic-tile
113  parent= 17  <g> classes=["label-group","zoom-6"] text="speech-recognition- model-language"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20)
114  parent=113  <text> classes=["topic-label"] text="speech-recognition- model-language"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label
115  parent=114  <tspan> classes=["line-1"] text="speech-recognition-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label > tspan.line-1:nth-of-type(1)
116  parent=114  <tspan> classes=["line-2"] text="model-language"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label > tspan.line-2:nth-of-type(2)
117  parent=113  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > rect.topic-tile
118  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET:nth-of-type(1)
119  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET","faded"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET.faded:nth-of-type(2)
120  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET:nth-of-type(4)
```

## 03-time-menu-open — 120 elements, truncated: true

tags: tspan×40, g×22, rect×21, text×20, div×13, canvas×3, svg×1

```
  1  parent=  -  <div> id="app" text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app
  2  parent=  1  <div> classes=["stand-alone-page"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page
  3  parent=  2  <div> classes=["mapview-page","s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF
  4  parent=  3  <div> id="popper-tooltip-top" role="tooltip" classes=["s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-top
  5  parent=  4  <div> classes=["popper-arrow","s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-top > div.popper-arrow.s-n1WHAIkRHwGF
  6  parent=  3  <div> id="popper-tooltip-bottom" role="tooltip" classes=["s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-bottom
  7  parent=  6  <div> classes=["popper-arrow","s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-bottom > div.popper-arrow.s-n1WHAIkRHwGF
  8  parent=  3  <div> classes=["s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3)
  9  parent=  8  <div> classes=["main-app","s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF
 10  parent=  9  <div> classes=["s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF
 11  parent= 10  <div> classes=["s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET
 12  parent= 11  <div> classes=["s-ovhWPbaoO3ET"]
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.s-ovhWPbaoO3ET:nth-of-type(1)
 13  parent= 11  <div> classes=["embedding","s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2)
 14  parent= 13  <svg> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1)
 15  parent= 14  <rect> classes=["mouse-track-rect"]
       selector: div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > rect.mouse-track-rect
 16  parent= 14  <g> classes=["topics"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2)
 17  parent= 16  <g> classes=["zoom-6"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6
 18  parent= 17  <g> classes=["label-group","zoom-6"] text="summarization-document- summaries-summary"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1)
 19  parent= 18  <text> classes=["topic-label"] text="summarization-document- summaries-summary"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label
 20  parent= 19  <tspan> classes=["line-1"] text="summarization-document-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label > tspan.line-1:nth-of-type(1)
 21  parent= 19  <tspan> classes=["line-2"] text="summaries-summary"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label > tspan.line-2:nth-of-type(2)
 22  parent= 18  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > rect.topic-tile
 23  parent= 17  <g> classes=["label-group","zoom-6"] text="question-answer- answering-qa"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2)
 24  parent= 23  <text> classes=["topic-label"] text="question-answer- answering-qa"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label
 25  parent= 24  <tspan> classes=["line-1"] text="question-answer-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label > tspan.line-1:nth-of-type(1)
 26  parent= 24  <tspan> classes=["line-2"] text="answering-qa"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label > tspan.line-2:nth-of-type(2)
 27  parent= 23  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > rect.topic-tile
 28  parent= 17  <g> classes=["label-group","zoom-6"] text="sentiment-analysis- classification-polarity"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3)
 29  parent= 28  <text> classes=["topic-label"] text="sentiment-analysis- classification-polarity"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label
 30  parent= 29  <tspan> classes=["line-1"] text="sentiment-analysis-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label > tspan.line-1:nth-of-type(1)
 31  parent= 29  <tspan> classes=["line-2"] text="classification-polarity"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label > tspan.line-2:nth-of-type(2)
 32  parent= 28  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > rect.topic-tile
 33  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-machine- neural-nmt"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4)
 34  parent= 33  <text> classes=["topic-label"] text="translation-machine- neural-nmt"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label
 35  parent= 34  <tspan> classes=["line-1"] text="translation-machine-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label > tspan.line-1:nth-of-type(1)
 36  parent= 34  <tspan> classes=["line-2"] text="neural-nmt"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label > tspan.line-2:nth-of-type(2)
 37  parent= 33  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > rect.topic-tile
 38  parent= 17  <g> classes=["label-group","zoom-6"] text="generation-text- language-model"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5)
 39  parent= 38  <text> classes=["topic-label"] text="generation-text- language-model"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label
 40  parent= 39  <tspan> classes=["line-1"] text="generation-text-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label > tspan.line-1:nth-of-type(1)
 41  parent= 39  <tspan> classes=["line-2"] text="language-model"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label > tspan.line-2:nth-of-type(2)
 42  parent= 38  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > rect.topic-tile
 43  parent= 17  <g> classes=["label-group","zoom-6"] text="parsing-dependency- parser-treebank"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6)
 44  parent= 43  <text> classes=["topic-label"] text="parsing-dependency- parser-treebank"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label
 45  parent= 44  <tspan> classes=["line-1"] text="parsing-dependency-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label > tspan.line-1:nth-of-type(1)
 46  parent= 44  <tspan> classes=["line-2"] text="parser-treebank"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label > tspan.line-2:nth-of-type(2)
 47  parent= 43  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > rect.topic-tile
 48  parent= 17  <g> classes=["label-group","zoom-6"] text="relation-extraction- relations-knowledge"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7)
 49  parent= 48  <text> classes=["topic-label"] text="relation-extraction- relations-knowledge"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label
 50  parent= 49  <tspan> classes=["line-1"] text="relation-extraction-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label > tspan.line-1:nth-of-type(1)
 51  parent= 49  <tspan> classes=["line-2"] text="relations-knowledge"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label > tspan.line-2:nth-of-type(2)
 52  parent= 48  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > rect.topic-tile
 53  parent= 17  <g> classes=["label-group","zoom-6"] text="hate-language- speech-detection"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8)
 54  parent= 53  <text> classes=["topic-label"] text="hate-language- speech-detection"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label
 55  parent= 54  <tspan> classes=["line-1"] text="hate-language-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label > tspan.line-1:nth-of-type(1)
 56  parent= 54  <tspan> classes=["line-2"] text="speech-detection"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label > tspan.line-2:nth-of-type(2)
 57  parent= 53  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > rect.topic-tile
 58  parent= 17  <g> classes=["label-group","zoom-6"] text="sense-word- disambiguation-wsd"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9)
 59  parent= 58  <text> classes=["topic-label"] text="sense-word- disambiguation-wsd"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label
 60  parent= 59  <tspan> classes=["line-1"] text="sense-word-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label > tspan.line-1:nth-of-type(1)
 61  parent= 59  <tspan> classes=["line-2"] text="disambiguation-wsd"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label > tspan.line-2:nth-of-type(2)
 62  parent= 58  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > rect.topic-tile
 63  parent= 17  <g> classes=["label-group","zoom-6"] text="clinical-medical- text-task"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10)
 64  parent= 63  <text> classes=["topic-label"] text="clinical-medical- text-task"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label
 65  parent= 64  <tspan> classes=["line-1"] text="clinical-medical-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label > tspan.line-1:nth-of-type(1)
 66  parent= 64  <tspan> classes=["line-2"] text="text-task"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label > tspan.line-2:nth-of-type(2)
 67  parent= 63  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > rect.topic-tile
 68  parent= 17  <g> classes=["label-group","zoom-6"] text="entity-named- ner-recognition"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11)
 69  parent= 68  <text> classes=["topic-label"] text="entity-named- ner-recognition"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label
 70  parent= 69  <tspan> classes=["line-1"] text="entity-named-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label > tspan.line-1:nth-of-type(1)
 71  parent= 69  <tspan> classes=["line-2"] text="ner-recognition"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label > tspan.line-2:nth-of-type(2)
 72  parent= 68  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > rect.topic-tile
 73  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-machine- based-statistical"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12)
 74  parent= 73  <text> classes=["topic-label"] text="translation-machine- based-statistical"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label
 75  parent= 74  <tspan> classes=["line-1"] text="translation-machine-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label > tspan.line-1:nth-of-type(1)
 76  parent= 74  <tspan> classes=["line-2"] text="based-statistical"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label > tspan.line-2:nth-of-type(2)
 77  parent= 73  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > rect.topic-tile
 78  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-based- machine-model"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13)
 79  parent= 78  <text> classes=["topic-label"] text="translation-based- machine-model"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label
 80  parent= 79  <tspan> classes=["line-1"] text="translation-based-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label > tspan.line-1:nth-of-type(1)
 81  parent= 79  <tspan> classes=["line-2"] text="machine-model"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label > tspan.line-2:nth-of-type(2)
 82  parent= 78  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > rect.topic-tile
 83  parent= 17  <g> classes=["label-group","zoom-6"] text="discourse-parsing- text-task"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14)
 84  parent= 83  <text> classes=["topic-label"] text="discourse-parsing- text-task"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label
 85  parent= 84  <tspan> classes=["line-1"] text="discourse-parsing-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label > tspan.line-1:nth-of-type(1)
 86  parent= 84  <tspan> classes=["line-2"] text="text-task"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label > tspan.line-2:nth-of-type(2)
 87  parent= 83  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > rect.topic-tile
 88  parent= 17  <g> classes=["label-group","zoom-6"] text="semantic-role- labeling-srl"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15)
 89  parent= 88  <text> classes=["topic-label"] text="semantic-role- labeling-srl"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label
 90  parent= 89  <tspan> classes=["line-1"] text="semantic-role-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label > tspan.line-1:nth-of-type(1)
 91  parent= 89  <tspan> classes=["line-2"] text="labeling-srl"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label > tspan.line-2:nth-of-type(2)
 92  parent= 88  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > rect.topic-tile
 93  parent= 17  <g> classes=["label-group","zoom-6"] text="task-language- offensive-detection"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16)
 94  parent= 93  <text> classes=["topic-label"] text="task-language- offensive-detection"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label
 95  parent= 94  <tspan> classes=["line-1"] text="task-language-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label > tspan.line-1:nth-of-type(1)
 96  parent= 94  <tspan> classes=["line-2"] text="offensive-detection"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label > tspan.line-2:nth-of-type(2)
 97  parent= 93  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > rect.topic-tile
 98  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-mt- language-machine"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17)
 99  parent= 98  <text> classes=["topic-label"] text="translation-mt- language-machine"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label
100  parent= 99  <tspan> classes=["line-1"] text="translation-mt-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label > tspan.line-1:nth-of-type(1)
101  parent= 99  <tspan> classes=["line-2"] text="language-machine"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label > tspan.line-2:nth-of-type(2)
102  parent= 98  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > rect.topic-tile
103  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-mt- speech-machine"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18)
104  parent=103  <text> classes=["topic-label"] text="translation-mt- speech-machine"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label
105  parent=104  <tspan> classes=["line-1"] text="translation-mt-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label > tspan.line-1:nth-of-type(1)
106  parent=104  <tspan> classes=["line-2"] text="speech-machine"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label > tspan.line-2:nth-of-type(2)
107  parent=103  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > rect.topic-tile
108  parent= 17  <g> classes=["label-group","zoom-6"] text="metaphor-metaphors- language-metaphorical"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19)
109  parent=108  <text> classes=["topic-label"] text="metaphor-metaphors- language-metaphorical"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label
110  parent=109  <tspan> classes=["line-1"] text="metaphor-metaphors-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label > tspan.line-1:nth-of-type(1)
111  parent=109  <tspan> classes=["line-2"] text="language-metaphorical"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label > tspan.line-2:nth-of-type(2)
112  parent=108  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > rect.topic-tile
113  parent= 17  <g> classes=["label-group","zoom-6"] text="speech-recognition- model-language"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20)
114  parent=113  <text> classes=["topic-label"] text="speech-recognition- model-language"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label
115  parent=114  <tspan> classes=["line-1"] text="speech-recognition-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label > tspan.line-1:nth-of-type(1)
116  parent=114  <tspan> classes=["line-2"] text="model-language"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label > tspan.line-2:nth-of-type(2)
117  parent=113  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > rect.topic-tile
118  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET:nth-of-type(1)
119  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET","faded"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET.faded:nth-of-type(2)
120  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET:nth-of-type(4)
```

## 04-search-results — 120 elements, truncated: true

tags: tspan×40, g×22, rect×21, text×20, div×13, canvas×3, svg×1

```
  1  parent=  -  <div> id="app" text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app
  2  parent=  1  <div> classes=["stand-alone-page"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page
  3  parent=  2  <div> classes=["mapview-page","s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF
  4  parent=  3  <div> id="popper-tooltip-top" role="tooltip" classes=["s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-top
  5  parent=  4  <div> classes=["popper-arrow","s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-top > div.popper-arrow.s-n1WHAIkRHwGF
  6  parent=  3  <div> id="popper-tooltip-bottom" role="tooltip" classes=["s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-bottom
  7  parent=  6  <div> classes=["popper-arrow","s-n1WHAIkRHwGF"]
       selector: #popper-tooltip-bottom > div.popper-arrow.s-n1WHAIkRHwGF
  8  parent=  3  <div> classes=["s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3)
  9  parent=  8  <div> classes=["main-app","s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF
 10  parent=  9  <div> classes=["s-n1WHAIkRHwGF"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF
 11  parent= 10  <div> classes=["s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET
 12  parent= 11  <div> classes=["s-ovhWPbaoO3ET"]
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.s-ovhWPbaoO3ET:nth-of-type(1)
 13  parent= 11  <div> classes=["embedding","s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: #app > div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2)
 14  parent= 13  <svg> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1)
 15  parent= 14  <rect> classes=["mouse-track-rect"]
       selector: div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > rect.mouse-track-rect
 16  parent= 14  <g> classes=["topics"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2)
 17  parent= 16  <g> classes=["zoom-6"] text="summarization-document- summaries-summary question-answer- answering-qa sentime…"
       selector: div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6
 18  parent= 17  <g> classes=["label-group","zoom-6"] text="summarization-document- summaries-summary"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1)
 19  parent= 18  <text> classes=["topic-label"] text="summarization-document- summaries-summary"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label
 20  parent= 19  <tspan> classes=["line-1"] text="summarization-document-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label > tspan.line-1:nth-of-type(1)
 21  parent= 19  <tspan> classes=["line-2"] text="summaries-summary"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > text.topic-label > tspan.line-2:nth-of-type(2)
 22  parent= 18  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(1) > rect.topic-tile
 23  parent= 17  <g> classes=["label-group","zoom-6"] text="question-answer- answering-qa"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2)
 24  parent= 23  <text> classes=["topic-label"] text="question-answer- answering-qa"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label
 25  parent= 24  <tspan> classes=["line-1"] text="question-answer-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label > tspan.line-1:nth-of-type(1)
 26  parent= 24  <tspan> classes=["line-2"] text="answering-qa"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > text.topic-label > tspan.line-2:nth-of-type(2)
 27  parent= 23  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(2) > rect.topic-tile
 28  parent= 17  <g> classes=["label-group","zoom-6"] text="sentiment-analysis- classification-polarity"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3)
 29  parent= 28  <text> classes=["topic-label"] text="sentiment-analysis- classification-polarity"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label
 30  parent= 29  <tspan> classes=["line-1"] text="sentiment-analysis-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label > tspan.line-1:nth-of-type(1)
 31  parent= 29  <tspan> classes=["line-2"] text="classification-polarity"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > text.topic-label > tspan.line-2:nth-of-type(2)
 32  parent= 28  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(3) > rect.topic-tile
 33  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-machine- neural-nmt"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4)
 34  parent= 33  <text> classes=["topic-label"] text="translation-machine- neural-nmt"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label
 35  parent= 34  <tspan> classes=["line-1"] text="translation-machine-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label > tspan.line-1:nth-of-type(1)
 36  parent= 34  <tspan> classes=["line-2"] text="neural-nmt"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > text.topic-label > tspan.line-2:nth-of-type(2)
 37  parent= 33  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(4) > rect.topic-tile
 38  parent= 17  <g> classes=["label-group","zoom-6"] text="generation-text- language-model"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5)
 39  parent= 38  <text> classes=["topic-label"] text="generation-text- language-model"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label
 40  parent= 39  <tspan> classes=["line-1"] text="generation-text-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label > tspan.line-1:nth-of-type(1)
 41  parent= 39  <tspan> classes=["line-2"] text="language-model"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > text.topic-label > tspan.line-2:nth-of-type(2)
 42  parent= 38  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(5) > rect.topic-tile
 43  parent= 17  <g> classes=["label-group","zoom-6"] text="parsing-dependency- parser-treebank"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6)
 44  parent= 43  <text> classes=["topic-label"] text="parsing-dependency- parser-treebank"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label
 45  parent= 44  <tspan> classes=["line-1"] text="parsing-dependency-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label > tspan.line-1:nth-of-type(1)
 46  parent= 44  <tspan> classes=["line-2"] text="parser-treebank"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > text.topic-label > tspan.line-2:nth-of-type(2)
 47  parent= 43  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(6) > rect.topic-tile
 48  parent= 17  <g> classes=["label-group","zoom-6"] text="relation-extraction- relations-knowledge"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7)
 49  parent= 48  <text> classes=["topic-label"] text="relation-extraction- relations-knowledge"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label
 50  parent= 49  <tspan> classes=["line-1"] text="relation-extraction-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label > tspan.line-1:nth-of-type(1)
 51  parent= 49  <tspan> classes=["line-2"] text="relations-knowledge"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > text.topic-label > tspan.line-2:nth-of-type(2)
 52  parent= 48  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(7) > rect.topic-tile
 53  parent= 17  <g> classes=["label-group","zoom-6"] text="hate-language- speech-detection"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8)
 54  parent= 53  <text> classes=["topic-label"] text="hate-language- speech-detection"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label
 55  parent= 54  <tspan> classes=["line-1"] text="hate-language-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label > tspan.line-1:nth-of-type(1)
 56  parent= 54  <tspan> classes=["line-2"] text="speech-detection"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > text.topic-label > tspan.line-2:nth-of-type(2)
 57  parent= 53  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(8) > rect.topic-tile
 58  parent= 17  <g> classes=["label-group","zoom-6"] text="sense-word- disambiguation-wsd"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9)
 59  parent= 58  <text> classes=["topic-label"] text="sense-word- disambiguation-wsd"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label
 60  parent= 59  <tspan> classes=["line-1"] text="sense-word-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label > tspan.line-1:nth-of-type(1)
 61  parent= 59  <tspan> classes=["line-2"] text="disambiguation-wsd"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > text.topic-label > tspan.line-2:nth-of-type(2)
 62  parent= 58  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(9) > rect.topic-tile
 63  parent= 17  <g> classes=["label-group","zoom-6"] text="clinical-medical- text-task"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10)
 64  parent= 63  <text> classes=["topic-label"] text="clinical-medical- text-task"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label
 65  parent= 64  <tspan> classes=["line-1"] text="clinical-medical-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label > tspan.line-1:nth-of-type(1)
 66  parent= 64  <tspan> classes=["line-2"] text="text-task"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > text.topic-label > tspan.line-2:nth-of-type(2)
 67  parent= 63  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(10) > rect.topic-tile
 68  parent= 17  <g> classes=["label-group","zoom-6"] text="entity-named- ner-recognition"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11)
 69  parent= 68  <text> classes=["topic-label"] text="entity-named- ner-recognition"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label
 70  parent= 69  <tspan> classes=["line-1"] text="entity-named-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label > tspan.line-1:nth-of-type(1)
 71  parent= 69  <tspan> classes=["line-2"] text="ner-recognition"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > text.topic-label > tspan.line-2:nth-of-type(2)
 72  parent= 68  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(11) > rect.topic-tile
 73  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-machine- based-statistical"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12)
 74  parent= 73  <text> classes=["topic-label"] text="translation-machine- based-statistical"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label
 75  parent= 74  <tspan> classes=["line-1"] text="translation-machine-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label > tspan.line-1:nth-of-type(1)
 76  parent= 74  <tspan> classes=["line-2"] text="based-statistical"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > text.topic-label > tspan.line-2:nth-of-type(2)
 77  parent= 73  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(12) > rect.topic-tile
 78  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-based- machine-model"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13)
 79  parent= 78  <text> classes=["topic-label"] text="translation-based- machine-model"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label
 80  parent= 79  <tspan> classes=["line-1"] text="translation-based-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label > tspan.line-1:nth-of-type(1)
 81  parent= 79  <tspan> classes=["line-2"] text="machine-model"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > text.topic-label > tspan.line-2:nth-of-type(2)
 82  parent= 78  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(13) > rect.topic-tile
 83  parent= 17  <g> classes=["label-group","zoom-6"] text="discourse-parsing- text-task"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14)
 84  parent= 83  <text> classes=["topic-label"] text="discourse-parsing- text-task"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label
 85  parent= 84  <tspan> classes=["line-1"] text="discourse-parsing-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label > tspan.line-1:nth-of-type(1)
 86  parent= 84  <tspan> classes=["line-2"] text="text-task"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > text.topic-label > tspan.line-2:nth-of-type(2)
 87  parent= 83  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(14) > rect.topic-tile
 88  parent= 17  <g> classes=["label-group","zoom-6"] text="semantic-role- labeling-srl"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15)
 89  parent= 88  <text> classes=["topic-label"] text="semantic-role- labeling-srl"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label
 90  parent= 89  <tspan> classes=["line-1"] text="semantic-role-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label > tspan.line-1:nth-of-type(1)
 91  parent= 89  <tspan> classes=["line-2"] text="labeling-srl"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > text.topic-label > tspan.line-2:nth-of-type(2)
 92  parent= 88  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(15) > rect.topic-tile
 93  parent= 17  <g> classes=["label-group","zoom-6"] text="task-language- offensive-detection"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16)
 94  parent= 93  <text> classes=["topic-label"] text="task-language- offensive-detection"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label
 95  parent= 94  <tspan> classes=["line-1"] text="task-language-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label > tspan.line-1:nth-of-type(1)
 96  parent= 94  <tspan> classes=["line-2"] text="offensive-detection"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > text.topic-label > tspan.line-2:nth-of-type(2)
 97  parent= 93  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(16) > rect.topic-tile
 98  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-mt- language-machine"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17)
 99  parent= 98  <text> classes=["topic-label"] text="translation-mt- language-machine"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label
100  parent= 99  <tspan> classes=["line-1"] text="translation-mt-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label > tspan.line-1:nth-of-type(1)
101  parent= 99  <tspan> classes=["line-2"] text="language-machine"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > text.topic-label > tspan.line-2:nth-of-type(2)
102  parent= 98  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(17) > rect.topic-tile
103  parent= 17  <g> classes=["label-group","zoom-6"] text="translation-mt- speech-machine"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18)
104  parent=103  <text> classes=["topic-label"] text="translation-mt- speech-machine"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label
105  parent=104  <tspan> classes=["line-1"] text="translation-mt-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label > tspan.line-1:nth-of-type(1)
106  parent=104  <tspan> classes=["line-2"] text="speech-machine"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > text.topic-label > tspan.line-2:nth-of-type(2)
107  parent=103  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(18) > rect.topic-tile
108  parent= 17  <g> classes=["label-group","zoom-6"] text="metaphor-metaphors- language-metaphorical"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19)
109  parent=108  <text> classes=["topic-label"] text="metaphor-metaphors- language-metaphorical"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label
110  parent=109  <tspan> classes=["line-1"] text="metaphor-metaphors-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label > tspan.line-1:nth-of-type(1)
111  parent=109  <tspan> classes=["line-2"] text="language-metaphorical"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > text.topic-label > tspan.line-2:nth-of-type(2)
112  parent=108  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(19) > rect.topic-tile
113  parent= 17  <g> classes=["label-group","zoom-6"] text="speech-recognition- model-language"
       selector: div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20)
114  parent=113  <text> classes=["topic-label"] text="speech-recognition- model-language"
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label
115  parent=114  <tspan> classes=["line-1"] text="speech-recognition-"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label > tspan.line-1:nth-of-type(1)
116  parent=114  <tspan> classes=["line-2"] text="model-language"
       selector: svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > text.topic-label > tspan.line-2:nth-of-type(2)
117  parent=113  <rect> classes=["topic-tile"]
       selector: div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > svg.s-ovhWPbaoO3ET:nth-of-type(1) > g > g > g.topics:nth-of-type(2) > g.zoom-6 > g.label-group.zoom-6:nth-of-type(20) > rect.topic-tile
118  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET:nth-of-type(1)
119  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET","faded"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET.faded:nth-of-type(2)
120  parent= 13  <canvas> size="1440pxx900px" classes=["s-ovhWPbaoO3ET"]
       selector: div.stand-alone-page > div.mapview-page.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF:nth-of-type(3) > div.main-app.s-n1WHAIkRHwGF > div.s-n1WHAIkRHwGF > div.s-ovhWPbaoO3ET > div.embedding.s-ovhWPbaoO3ET:nth-of-type(2) > canvas.s-ovhWPbaoO3ET:nth-of-type(4)
```
