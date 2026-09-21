# The document, as the browser holds it

Captured straight from the running artifact with no collector involved: every
element and every attribute, in tree order, at four moments of the interface's
life. Where more than three consecutive siblings have the same tag and the same
set of attribute names, the first is shown and the rest counted — that is the
only thing removed, and it is always counted.

Long attribute values and long text runs are cut at 90 characters with an ellipsis.

## 01-on-load — 309 lines

```
<html lang="en">
  <head>
    <script type="module" src="/@vite/client">
    <meta charset="UTF-8">
    <link rel="icon" href="/favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title> "WizMap"
    <link rel="stylesheet" href="/global.css">
    <style type="text/css" data-vite-dev-id="/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e…"> ".floating-window.s-_i_Kb1cILe8P.s-_i_Kb1cILe8P{position:absolute;max-width:500px;min-width…"
    … 4 more siblings of the same shape
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
    <link href="https://fonts.googleapis.com/css2?family=Lato&display=swap" rel="stylesheet">
  <body>
    <div id="app">
      <div class="stand-alone-page">
        <div class="mapview-page s-n1WHAIkRHwGF">
          <div id="popper-tooltip-top" class="popper-tooltip hidden s-n1WHAIkRHwGF" role="tooltip">
            <span class="popper-content s-n1WHAIkRHwGF">
            <div class="popper-arrow s-n1WHAIkRHwGF">
          <div id="popper-tooltip-bottom" class="popper-tooltip hidden s-n1WHAIkRHwGF" role="tooltip">
            <span class="popper-content s-n1WHAIkRHwGF">
            <div class="popper-arrow s-n1WHAIkRHwGF">
          <div class="app-wrapper s-n1WHAIkRHwGF">
            <div class="main-app s-n1WHAIkRHwGF">
              <div class="main-app-container s-n1WHAIkRHwGF">
                <div class="embedding-wrapper s-ovhWPbaoO3ET">
                  <div class="grab-blocker s-ovhWPbaoO3ET">
                  <div class="embedding s-ovhWPbaoO3ET">
                    <svg class="top-svg s-ovhWPbaoO3ET" width="1440px" height="900px" transform="translate(0, 0)">
                      <g class="top-group" transform="translate(350.0576067369208,-135.4270013…">
                        <rect class="mouse-track-rect" width="1440" height="900">
                        <g class="top-content">
                          <g class="topics-bottom">
                          <g class="topics">
                            <g class="topics-content zoom-6" style="opacity: 1;">
                              <g class="label-group zoom-6">
                                <text class="topic-label left" transform="translate(338.2073240077961, 757.3495798…" paint-order="stroke" style="font-size: 11.5344px; stroke: rgb(255, 2…">
                                  <tspan class="line-1" x="0" y="0"> "summarization-document-"
                                  <tspan class="line-2" x="0" y="0" dy="11.07297970479705"> "summaries-summary"
                                <rect class="topic-tile" x="343.4801714862709" y="756.548731068067" rx="3.295529674046741" ry="3.295529674046741" width="26.97727606918494" height="26.97727606918494" style="stroke-width: 1.31821;">
                                <path class="direction-indicator" transform-origin="center" d="M0,2.472A2.472,2.472,0,1,1,0,-2.472L0,0Z" transform="translate(343.4801714862709, 770.0373691…">
                              … 19 more siblings of the same shape
                              <g class="label-group zoom-6 hidden">
                                <text class="topic-label left" transform="translate(419.1391522153511, 325.7131627…" paint-order="stroke" style="font-size: 11.5344px; stroke: rgb(255, 2…">
                                  <tspan class="line-1" x="0" y="0"> "grammar-parsing-"
                                  <tspan class="line-2" x="0" y="0" dy="11.07297970479705"> "grammars-language"
                                <rect class="topic-tile" x="424.41199969382586" y="324.9123139611072" rx="3.295529674046741" ry="3.295529674046741" width="26.97727606918494" height="26.97727606918494" style="stroke-width: 1.31821;">
                                <path class="direction-indicator" transform-origin="center" d="M0,2.472A2.472,2.472,0,1,1,0,-2.472L0,0Z" transform="translate(424.41199969382586, 338.400951…">
                              … 37 more siblings of the same shape
                          <g class="topics-top">
                          <g class="highlights">
                    <canvas class="search-point-canvas hidden s-ovhWPbaoO3ET" width="1440px" height="900px">
                    <canvas class="embedding-canvas s-ovhWPbaoO3ET faded" width="1440px" height="900px">
                    <canvas class="embedding-canvas-back s-ovhWPbaoO3ET">
                    <canvas class="topic-grid-canvas top s-ovhWPbaoO3ET hidden" width="1440px" height="900px">
                    <canvas class="topic-grid-canvas bottom s-ovhWPbaoO3ET hidden" width="1440px" height="900px">
                    <svg class="embedding-svg s-ovhWPbaoO3ET" width="1440px" height="900px">
                      <g class="umap-group" transform="translate(350.0576067369208,-135.4270013…">
                        <g class="contour-group" style="display: unset;">
                          <path fill="rgb(237, 242, 249)" d="M414.955,762.75L416.25,763.846L418.261,7…">
                          … 10 more siblings of the same shape
                        <g class="contour-group-time hidden">
                  <div class="floating-window-wrapper s-ovhWPbaoO3ET">
                    <div class="floating-window s-_i_Kb1cILe8P hidden">
                      <div class="window-header s-_i_Kb1cILe8P">
                        <div class="window-info s-_i_Kb1cILe8P" title="Window">
                          <span class="window-name s-_i_Kb1cILe8P"> "Point undefined"
                        <div class="control-buttons s-_i_Kb1cILe8P">
                          <div class="control-close s-_i_Kb1cILe8P" title="Close">
                            <div class="svg-icon s-_i_Kb1cILe8P">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
                                <path fill-rule="evenodd" d="M2.343 13.657A8 8 0 1113.657 2.343 8 8 0…">
                      <div class="content s-_i_Kb1cILe8P">
                  <div class="control-bar s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 87 87" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25566,-11721)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-contour2" transform="matrix(1,0,0,1,8.55696,152.857)">
                                  <g transform="matrix(1.45179,-0.397085,0.389006,1.4819…">
                                    <path d="M25612.7,11621C25634.4,11621 25650.2,116…" style="fill:none;stroke:currentColor;stroke-wid…">
                                  … 2 more siblings of the same shape
                        <div class="name s-ovhWPbaoO3ET"> "Contour"
                        <div class="caret s-ovhWPbaoO3ET hidden">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 76 76" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-26227,-11618)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-point">
                                  <g transform="matrix(1.42616,0,0,1.45578,-34359.1,-942…">
                                    <circle cx="26395" cy="11641" r="12">
                                  … 2 more siblings of the same shape
                        <div class="name s-ovhWPbaoO3ET"> "Point"
                        <div class="caret s-ovhWPbaoO3ET hidden">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 76 74" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25694,-11622)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-grid" transform="matrix(1.42616,0,0,1.45578,2479.76,7597.…">
                                  <path d="M13.232,-18.018L80.811,-18.018C82.959,-1…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Grid"
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 86 82" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-26097,-11616)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-label3" transform="matrix(1.42616,0,0,1.45578,3054.77,7590.…">
                                  <path d="M34.277,7.373C36.426,7.373 37.891,6.25 4…" style="fill-rule:nonzero;">
                                  <path d="M46.24,-20.313L60.596,-20.313C62.207,-20…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Label"
                        <div class="caret s-ovhWPbaoO3ET">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                      <button class="menu label-menu s-ovhWPbaoO3ET hidden">
                        <div class="control-item s-ovhWPbaoO3ET">
                          <div class="item-header s-ovhWPbaoO3ET"> "Automatic Labeling"
                          <div class="control-row s-ovhWPbaoO3ET">
                            <input type="checkbox" class="checkbox s-ovhWPbaoO3ET" id="checkbox-label" name="checkbox-label">
                            <label for="checkbox-label" class="s-ovhWPbaoO3ET"> "High Density Region"
                        <div class="control-item slider-item s-ovhWPbaoO3ET">
                          <div class="control-row s-ovhWPbaoO3ET">
                            <label class="slider-label s-ovhWPbaoO3ET" for="slider-label-num"> "Number of Labels"
                            <span class="slider-count s-ovhWPbaoO3ET"> "20"
                          <input type="range" class="slider s-ovhWPbaoO3ET" id="slider-label-num" name="label-num" min="0" max="58">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <button class="item s-ovhWPbaoO3ET">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 80 79" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25095,-11623)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-time2" transform="matrix(1.42616,0,0,1.45578,1629.42,7602.…">
                                  <path d="M26.709,-30.908L46.191,-30.908C47.9,-30.…" style="fill-rule:nonzero;">
                                  <path d="M46.24,4.15C67.773,4.15 85.693,-13.721 8…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Time"
                        <div class="caret s-ovhWPbaoO3ET">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                      <button class="menu time-menu s-ovhWPbaoO3ET hidden">
                        <div class="control-row s-ovhWPbaoO3ET">
                          <div class="play-pause-button s-ovhWPbaoO3ET">
                            <button class="svg-icon s-ovhWPbaoO3ET">
                              <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                                <g transform="matrix(1,0,0,1,-24240,-11783)">
                                  <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                    <g transform="matrix(1.42616,0,0,1.45578,-36227.4,-933…">
                                      <g id="icon-play-solid">
                                        <path d="M25736,11801.4C25714.5,11801.4 25696.5,1…" style="fill-rule:nonzero;">
                            <button class="svg-icon s-ovhWPbaoO3ET hidden">
                              <svg width="100%" height="100%" viewBox="0 0 80 79" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                                <g transform="matrix(1,0,0,1,-24346,-11782)">
                                  <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                    <g transform="matrix(1.42616,0,0,1.45578,-36227.4,-933…">
                                      <g id="icon-pause-solid">
                                        <path d="M25842,11800.3C25820.5,11800.3 25802.5,1…" style="fill-rule:nonzero;">
                          <div class="slider-container s-ovhWPbaoO3ET">
                            <div class="back-slider s-ovhWPbaoO3ET">
                            <div class="slider s-ovhWPbaoO3ET">
                              <div class="range-track s-ovhWPbaoO3ET">
                              <div class="middle-thumb s-ovhWPbaoO3ET" id="time-slider-middle-thumb" tabindex="-1">
                                <div class="thumb-label thumb-label-middle s-ovhWPbaoO3ET">
                                  <span class="thumb-label-span s-ovhWPbaoO3ET">
                            <div class="slider-svg-container s-ovhWPbaoO3ET">
                              <svg class="slider-svg s-ovhWPbaoO3ET">
                                <g class="axis-group" fill="none" font-size="10" font-family="sans-serif" text-anchor="middle">
                                  <path class="domain" stroke="currentColor" d="M0.5,9V0.5H400.5V9">
                                  <g class="tick" opacity="1" transform="translate(0.5,0)">
                                    <line stroke="currentColor" y2="9">
                                    <text fill="currentColor" y="12" dy="0.71em"> "1980"
                                  … 4 more siblings of the same shape
          <div class="footer-container s-n1WHAIkRHwGF">
            <div class="footer-wrapper s-JGw2lZm6jsjW">
              <dialog id="dataset-dialog" class="s-JGw2lZm6jsjW">
                <div class="header s-JGw2lZm6jsjW"> "Choose an Embedding"
                <div class="row-block s-JGw2lZm6jsjW">
                  <div class="dataset-list s-JGw2lZm6jsjW">
                    <ul class="s-JGw2lZm6jsjW">
                      <li class="s-JGw2lZm6jsjW">
                        <a href="./?dataset=diffusiondb" class="s-JGw2lZm6jsjW"> "DiffusionDB (1.8M text + 1.8M images)"
                      … 2 more siblings of the same shape
                <div class="separator s-JGw2lZm6jsjW">
                <div class="header s-JGw2lZm6jsjW"> "My Own Embedding"
                <div class="input-form s-JGw2lZm6jsjW">
                  <div class="row s-JGw2lZm6jsjW">
                    <span class="row-header s-JGw2lZm6jsjW"> "Data JSON URL"
                      <a href="https://github.com/poloclub/wizmap#use-my-own-embeddings" target="_blank" class="s-JGw2lZm6jsjW"> "(what is this?)"
                    <input placeholder="https://xxx.ndjson" class="s-JGw2lZm6jsjW">
                  <div class="row s-JGw2lZm6jsjW">
                    <span class="row-header s-JGw2lZm6jsjW"> "Grid JSON URL"
                      <a href="https://github.com/poloclub/wizmap#use-my-own-embeddings" target="_blank" class="s-JGw2lZm6jsjW"> "(what is this?)"
                    <input placeholder="https://xxx.json" class="s-JGw2lZm6jsjW">
                <div class="button-block s-JGw2lZm6jsjW">
                  <button class="close-button s-JGw2lZm6jsjW"> "Create"
                  <button class="close-button s-JGw2lZm6jsjW"> "Close"
              <div class="zoom-control s-JGw2lZm6jsjW">
                <button class="zoom-button zoom-button-reset s-JGw2lZm6jsjW">
                  <div class="svg-icon s-JGw2lZm6jsjW">
                    <svg width="100%" height="100%" viewBox="0 0 88 71" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24474,-11788)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g id="icon-folder" transform="matrix(1.42616,0,0,1.45578,739.303,7837.…">
                            <path d="M22.217,-0.098L86.279,-0.098C93.213,-0.0…" style="fill-rule:nonzero;">
              … 2 more siblings of the same shape
              <div class="footer s-JGw2lZm6jsjW">
                <span class="name s-JGw2lZm6jsjW"> "WizMap"
                  <span class="svg-icon s-JGw2lZm6jsjW">
                    <svg width="100%" height="100%" viewBox="0 0 157 184" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-20300,-9901)">
                        <g transform="matrix(1.30552,0,0,1.07514,20166.5,-141.…">
                          <g id="icon-wizmap" transform="matrix(1,0,0,1,-3205.6,106.033)">
                            <g transform="matrix(1.42038,6.43683,-5.30094,1.72474,…">
                              <path d="M13.503,3.017C14.962,3.017 16.147,8.052 …" style="fill-rule:nonzero;">
                            … 4 more siblings of the same shape
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://arxiv.org/abs/2306.09328" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Paper"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg width="100%" height="100%" viewBox="0 0 66 83" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-23997,-11783)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-file" transform="matrix(1.42616,0,0,1.45578,59.3956,7838.…">
                              <path d="M22.022,5.908L62.5,5.908C70.703,5.908 74…" style="fill-rule:nonzero;">
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://github.com/poloclub/wizmap" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Code"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 512">
                        <path d="M186.1 328.7c0 20.9-10.9 55.1-36.7 55.1s…">
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://youtu.be/8fJG87QVceQ" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Video"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-24106,-11783)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-play" transform="matrix(1.42616,0,0,1.45578,219.154,7836.…">
                              <path d="M46.24,4.15C67.773,4.15 85.693,-13.721 8…" style="fill-rule:nonzero;">
                              <path d="M39.16,-20.313L60.889,-33.106C62.598,-34…" style="fill-rule:nonzero;">
                <div class="splitter s-JGw2lZm6jsjW">
                <button class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "ACL Abstracts"
                <div class="splitter s-JGw2lZm6jsjW">
                <span class="count s-JGw2lZm6jsjW">
                  <span class="total-count s-JGw2lZm6jsjW"> "63,213 Data Points"
                  <span class="subset-count s-JGw2lZm6jsjW hidden"> "60000 Data Points"
                <div class="splitter s-JGw2lZm6jsjW">
                <div class="scale-legend s-JGw2lZm6jsjW">
                  <span class="sclae-num s-JGw2lZm6jsjW"> "0.7635"
                  <div class="scale-line s-JGw2lZm6jsjW" style="width: 50px">
          <div class="search-panel-container s-n1WHAIkRHwGF">
            <div class="search-panel-wrapper s-H0d2FahnGNOH">
              <div class="search-list-container s-H0d2FahnGNOH">
                <div class="search-list s-H0d2FahnGNOH">
                  <div class="header-gap s-H0d2FahnGNOH hidden">
                  <div class="result-list s-H0d2FahnGNOH">
                    <div class="count-label s-H0d2FahnGNOH"> "0 Search Results"
                    <button class="add-more-button s-H0d2FahnGNOH hidden">
                      <span class="s-H0d2FahnGNOH"> "Show More"
                  <button class="scroll-up-button s-H0d2FahnGNOH hidden"> "Back to top"
                    <div class="svg-icon s-H0d2FahnGNOH">
                      <svg width="100%" height="100%" viewBox="0 0 59 81" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-24851,-11621)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-top" transform="matrix(1.42616,0,0,1.45578,1277.14,7601.…">
                              <path d="M68.359,-38.135C68.359,-39.16 67.969,-40…" style="fill-rule:nonzero;">
              <div class="search-bar s-H0d2FahnGNOH">
                <div class="svg-icon logo-icon s-H0d2FahnGNOH">
                  <svg width="100%" height="100%" viewBox="0 0 157 184" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                    <g transform="matrix(1,0,0,1,-20300,-9901)">
                      <g transform="matrix(1.30552,0,0,1.07514,20166.5,-141.…">
                        <g id="icon-wizmap" transform="matrix(1,0,0,1,-3205.6,106.033)">
                          <g transform="matrix(1.42038,6.43683,-5.30094,1.72474,…">
                            <path d="M13.503,3.017C14.962,3.017 16.147,8.052 …" style="fill-rule:nonzero;">
                          … 4 more siblings of the same shape
                <input type="text" id="search-bar-input" name="search-query" placeholder="Search WizMap Embeddings" spellcheck="false" class="s-H0d2FahnGNOH">
                <div class="end-button s-H0d2FahnGNOH">
                  <div class="svg-icon search-icon s-H0d2FahnGNOH">
                    <svg width="100%" height="100%" viewBox="0 0 76 77" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24600,-11627)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g id="icon-search" transform="matrix(1.42616,0,0,1.45578,920.494,7607.…">
                            <path d="M8.789,-42.236C8.789,-25.098 22.705,-11.…" style="fill-rule:nonzero;">
                  <button class="svg-icon cancel-icon s-H0d2FahnGNOH hidden">
                    <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24726,-11623)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g transform="matrix(1.42616,0,0,1.45578,-34150.9,-942…">
                            <g id="icon-cancel">
                              <path d="M24765.6,11702.3C24744.1,11702.3 24726.2…" style="fill-rule:nonzero;">
    <script type="module" src="/src/main.ts">
```

## 02-label-menu-open — 309 lines

```
<html lang="en">
  <head>
    <script type="module" src="/@vite/client">
    <meta charset="UTF-8">
    <link rel="icon" href="/favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title> "WizMap"
    <link rel="stylesheet" href="/global.css">
    <style type="text/css" data-vite-dev-id="/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e…"> ".floating-window.s-_i_Kb1cILe8P.s-_i_Kb1cILe8P{position:absolute;max-width:500px;min-width…"
    … 4 more siblings of the same shape
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
    <link href="https://fonts.googleapis.com/css2?family=Lato&display=swap" rel="stylesheet">
  <body>
    <div id="app">
      <div class="stand-alone-page">
        <div class="mapview-page s-n1WHAIkRHwGF">
          <div id="popper-tooltip-top" class="popper-tooltip hidden s-n1WHAIkRHwGF" role="tooltip">
            <span class="popper-content s-n1WHAIkRHwGF">
            <div class="popper-arrow s-n1WHAIkRHwGF">
          <div id="popper-tooltip-bottom" class="popper-tooltip hidden s-n1WHAIkRHwGF" role="tooltip">
            <span class="popper-content s-n1WHAIkRHwGF">
            <div class="popper-arrow s-n1WHAIkRHwGF">
          <div class="app-wrapper s-n1WHAIkRHwGF">
            <div class="main-app s-n1WHAIkRHwGF">
              <div class="main-app-container s-n1WHAIkRHwGF">
                <div class="embedding-wrapper s-ovhWPbaoO3ET">
                  <div class="grab-blocker s-ovhWPbaoO3ET">
                  <div class="embedding s-ovhWPbaoO3ET">
                    <svg class="top-svg s-ovhWPbaoO3ET" width="1440px" height="900px" transform="translate(0, 0)">
                      <g class="top-group" transform="translate(350.0576067369208,-135.4270013…">
                        <rect class="mouse-track-rect" width="1440" height="900">
                        <g class="top-content">
                          <g class="topics-bottom">
                          <g class="topics">
                            <g class="topics-content zoom-6" style="opacity: 1;">
                              <g class="label-group zoom-6">
                                <text class="topic-label left" transform="translate(338.2073240077961, 757.3495798…" paint-order="stroke" style="font-size: 11.5344px; stroke: rgb(255, 2…">
                                  <tspan class="line-1" x="0" y="0"> "summarization-document-"
                                  <tspan class="line-2" x="0" y="0" dy="11.07297970479705"> "summaries-summary"
                                <rect class="topic-tile" x="343.4801714862709" y="756.548731068067" rx="3.295529674046741" ry="3.295529674046741" width="26.97727606918494" height="26.97727606918494" style="stroke-width: 1.31821;">
                                <path class="direction-indicator" transform-origin="center" d="M0,2.472A2.472,2.472,0,1,1,0,-2.472L0,0Z" transform="translate(343.4801714862709, 770.0373691…">
                              … 19 more siblings of the same shape
                              <g class="label-group zoom-6 hidden">
                                <text class="topic-label left" transform="translate(419.1391522153511, 325.7131627…" paint-order="stroke" style="font-size: 11.5344px; stroke: rgb(255, 2…">
                                  <tspan class="line-1" x="0" y="0"> "grammar-parsing-"
                                  <tspan class="line-2" x="0" y="0" dy="11.07297970479705"> "grammars-language"
                                <rect class="topic-tile" x="424.41199969382586" y="324.9123139611072" rx="3.295529674046741" ry="3.295529674046741" width="26.97727606918494" height="26.97727606918494" style="stroke-width: 1.31821;">
                                <path class="direction-indicator" transform-origin="center" d="M0,2.472A2.472,2.472,0,1,1,0,-2.472L0,0Z" transform="translate(424.41199969382586, 338.400951…">
                              … 37 more siblings of the same shape
                          <g class="topics-top">
                          <g class="highlights">
                    <canvas class="search-point-canvas hidden s-ovhWPbaoO3ET" width="1440px" height="900px">
                    <canvas class="embedding-canvas s-ovhWPbaoO3ET faded" width="1440px" height="900px">
                    <canvas class="embedding-canvas-back s-ovhWPbaoO3ET">
                    <canvas class="topic-grid-canvas top s-ovhWPbaoO3ET hidden" width="1440px" height="900px">
                    <canvas class="topic-grid-canvas bottom s-ovhWPbaoO3ET hidden" width="1440px" height="900px">
                    <svg class="embedding-svg s-ovhWPbaoO3ET" width="1440px" height="900px">
                      <g class="umap-group" transform="translate(350.0576067369208,-135.4270013…">
                        <g class="contour-group" style="display: unset;">
                          <path fill="rgb(237, 242, 249)" d="M414.955,762.75L416.25,763.846L418.261,7…">
                          … 10 more siblings of the same shape
                        <g class="contour-group-time hidden">
                  <div class="floating-window-wrapper s-ovhWPbaoO3ET">
                    <div class="floating-window s-_i_Kb1cILe8P hidden">
                      <div class="window-header s-_i_Kb1cILe8P">
                        <div class="window-info s-_i_Kb1cILe8P" title="Window">
                          <span class="window-name s-_i_Kb1cILe8P"> "Point undefined"
                        <div class="control-buttons s-_i_Kb1cILe8P">
                          <div class="control-close s-_i_Kb1cILe8P" title="Close">
                            <div class="svg-icon s-_i_Kb1cILe8P">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
                                <path fill-rule="evenodd" d="M2.343 13.657A8 8 0 1113.657 2.343 8 8 0…">
                      <div class="content s-_i_Kb1cILe8P">
                  <div class="control-bar s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 87 87" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25566,-11721)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-contour2" transform="matrix(1,0,0,1,8.55696,152.857)">
                                  <g transform="matrix(1.45179,-0.397085,0.389006,1.4819…">
                                    <path d="M25612.7,11621C25634.4,11621 25650.2,116…" style="fill:none;stroke:currentColor;stroke-wid…">
                                  … 2 more siblings of the same shape
                        <div class="name s-ovhWPbaoO3ET"> "Contour"
                        <div class="caret s-ovhWPbaoO3ET hidden">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 76 76" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-26227,-11618)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-point">
                                  <g transform="matrix(1.42616,0,0,1.45578,-34359.1,-942…">
                                    <circle cx="26395" cy="11641" r="12">
                                  … 2 more siblings of the same shape
                        <div class="name s-ovhWPbaoO3ET"> "Point"
                        <div class="caret s-ovhWPbaoO3ET hidden">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 76 74" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25694,-11622)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-grid" transform="matrix(1.42616,0,0,1.45578,2479.76,7597.…">
                                  <path d="M13.232,-18.018L80.811,-18.018C82.959,-1…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Grid"
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 86 82" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-26097,-11616)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-label3" transform="matrix(1.42616,0,0,1.45578,3054.77,7590.…">
                                  <path d="M34.277,7.373C36.426,7.373 37.891,6.25 4…" style="fill-rule:nonzero;">
                                  <path d="M46.24,-20.313L60.596,-20.313C62.207,-20…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Label"
                        <div class="caret s-ovhWPbaoO3ET activated">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                      <button class="menu label-menu s-ovhWPbaoO3ET">
                        <div class="control-item s-ovhWPbaoO3ET">
                          <div class="item-header s-ovhWPbaoO3ET"> "Automatic Labeling"
                          <div class="control-row s-ovhWPbaoO3ET">
                            <input type="checkbox" class="checkbox s-ovhWPbaoO3ET" id="checkbox-label" name="checkbox-label">
                            <label for="checkbox-label" class="s-ovhWPbaoO3ET"> "High Density Region"
                        <div class="control-item slider-item s-ovhWPbaoO3ET">
                          <div class="control-row s-ovhWPbaoO3ET">
                            <label class="slider-label s-ovhWPbaoO3ET" for="slider-label-num"> "Number of Labels"
                            <span class="slider-count s-ovhWPbaoO3ET"> "20"
                          <input type="range" class="slider s-ovhWPbaoO3ET" id="slider-label-num" name="label-num" min="0" max="58">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <button class="item s-ovhWPbaoO3ET">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 80 79" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25095,-11623)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-time2" transform="matrix(1.42616,0,0,1.45578,1629.42,7602.…">
                                  <path d="M26.709,-30.908L46.191,-30.908C47.9,-30.…" style="fill-rule:nonzero;">
                                  <path d="M46.24,4.15C67.773,4.15 85.693,-13.721 8…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Time"
                        <div class="caret s-ovhWPbaoO3ET">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                      <button class="menu time-menu s-ovhWPbaoO3ET hidden">
                        <div class="control-row s-ovhWPbaoO3ET">
                          <div class="play-pause-button s-ovhWPbaoO3ET">
                            <button class="svg-icon s-ovhWPbaoO3ET">
                              <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                                <g transform="matrix(1,0,0,1,-24240,-11783)">
                                  <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                    <g transform="matrix(1.42616,0,0,1.45578,-36227.4,-933…">
                                      <g id="icon-play-solid">
                                        <path d="M25736,11801.4C25714.5,11801.4 25696.5,1…" style="fill-rule:nonzero;">
                            <button class="svg-icon s-ovhWPbaoO3ET hidden">
                              <svg width="100%" height="100%" viewBox="0 0 80 79" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                                <g transform="matrix(1,0,0,1,-24346,-11782)">
                                  <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                    <g transform="matrix(1.42616,0,0,1.45578,-36227.4,-933…">
                                      <g id="icon-pause-solid">
                                        <path d="M25842,11800.3C25820.5,11800.3 25802.5,1…" style="fill-rule:nonzero;">
                          <div class="slider-container s-ovhWPbaoO3ET">
                            <div class="back-slider s-ovhWPbaoO3ET">
                            <div class="slider s-ovhWPbaoO3ET">
                              <div class="range-track s-ovhWPbaoO3ET">
                              <div class="middle-thumb s-ovhWPbaoO3ET" id="time-slider-middle-thumb" tabindex="-1">
                                <div class="thumb-label thumb-label-middle s-ovhWPbaoO3ET">
                                  <span class="thumb-label-span s-ovhWPbaoO3ET">
                            <div class="slider-svg-container s-ovhWPbaoO3ET">
                              <svg class="slider-svg s-ovhWPbaoO3ET">
                                <g class="axis-group" fill="none" font-size="10" font-family="sans-serif" text-anchor="middle">
                                  <path class="domain" stroke="currentColor" d="M0.5,9V0.5H400.5V9">
                                  <g class="tick" opacity="1" transform="translate(0.5,0)">
                                    <line stroke="currentColor" y2="9">
                                    <text fill="currentColor" y="12" dy="0.71em"> "1980"
                                  … 4 more siblings of the same shape
          <div class="footer-container s-n1WHAIkRHwGF">
            <div class="footer-wrapper s-JGw2lZm6jsjW">
              <dialog id="dataset-dialog" class="s-JGw2lZm6jsjW">
                <div class="header s-JGw2lZm6jsjW"> "Choose an Embedding"
                <div class="row-block s-JGw2lZm6jsjW">
                  <div class="dataset-list s-JGw2lZm6jsjW">
                    <ul class="s-JGw2lZm6jsjW">
                      <li class="s-JGw2lZm6jsjW">
                        <a href="./?dataset=diffusiondb" class="s-JGw2lZm6jsjW"> "DiffusionDB (1.8M text + 1.8M images)"
                      … 2 more siblings of the same shape
                <div class="separator s-JGw2lZm6jsjW">
                <div class="header s-JGw2lZm6jsjW"> "My Own Embedding"
                <div class="input-form s-JGw2lZm6jsjW">
                  <div class="row s-JGw2lZm6jsjW">
                    <span class="row-header s-JGw2lZm6jsjW"> "Data JSON URL"
                      <a href="https://github.com/poloclub/wizmap#use-my-own-embeddings" target="_blank" class="s-JGw2lZm6jsjW"> "(what is this?)"
                    <input placeholder="https://xxx.ndjson" class="s-JGw2lZm6jsjW">
                  <div class="row s-JGw2lZm6jsjW">
                    <span class="row-header s-JGw2lZm6jsjW"> "Grid JSON URL"
                      <a href="https://github.com/poloclub/wizmap#use-my-own-embeddings" target="_blank" class="s-JGw2lZm6jsjW"> "(what is this?)"
                    <input placeholder="https://xxx.json" class="s-JGw2lZm6jsjW">
                <div class="button-block s-JGw2lZm6jsjW">
                  <button class="close-button s-JGw2lZm6jsjW"> "Create"
                  <button class="close-button s-JGw2lZm6jsjW"> "Close"
              <div class="zoom-control s-JGw2lZm6jsjW">
                <button class="zoom-button zoom-button-reset s-JGw2lZm6jsjW">
                  <div class="svg-icon s-JGw2lZm6jsjW">
                    <svg width="100%" height="100%" viewBox="0 0 88 71" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24474,-11788)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g id="icon-folder" transform="matrix(1.42616,0,0,1.45578,739.303,7837.…">
                            <path d="M22.217,-0.098L86.279,-0.098C93.213,-0.0…" style="fill-rule:nonzero;">
              … 2 more siblings of the same shape
              <div class="footer s-JGw2lZm6jsjW">
                <span class="name s-JGw2lZm6jsjW"> "WizMap"
                  <span class="svg-icon s-JGw2lZm6jsjW">
                    <svg width="100%" height="100%" viewBox="0 0 157 184" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-20300,-9901)">
                        <g transform="matrix(1.30552,0,0,1.07514,20166.5,-141.…">
                          <g id="icon-wizmap" transform="matrix(1,0,0,1,-3205.6,106.033)">
                            <g transform="matrix(1.42038,6.43683,-5.30094,1.72474,…">
                              <path d="M13.503,3.017C14.962,3.017 16.147,8.052 …" style="fill-rule:nonzero;">
                            … 4 more siblings of the same shape
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://arxiv.org/abs/2306.09328" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Paper"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg width="100%" height="100%" viewBox="0 0 66 83" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-23997,-11783)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-file" transform="matrix(1.42616,0,0,1.45578,59.3956,7838.…">
                              <path d="M22.022,5.908L62.5,5.908C70.703,5.908 74…" style="fill-rule:nonzero;">
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://github.com/poloclub/wizmap" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Code"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 512">
                        <path d="M186.1 328.7c0 20.9-10.9 55.1-36.7 55.1s…">
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://youtu.be/8fJG87QVceQ" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Video"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-24106,-11783)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-play" transform="matrix(1.42616,0,0,1.45578,219.154,7836.…">
                              <path d="M46.24,4.15C67.773,4.15 85.693,-13.721 8…" style="fill-rule:nonzero;">
                              <path d="M39.16,-20.313L60.889,-33.106C62.598,-34…" style="fill-rule:nonzero;">
                <div class="splitter s-JGw2lZm6jsjW">
                <button class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "ACL Abstracts"
                <div class="splitter s-JGw2lZm6jsjW">
                <span class="count s-JGw2lZm6jsjW">
                  <span class="total-count s-JGw2lZm6jsjW"> "63,213 Data Points"
                  <span class="subset-count s-JGw2lZm6jsjW hidden"> "60000 Data Points"
                <div class="splitter s-JGw2lZm6jsjW">
                <div class="scale-legend s-JGw2lZm6jsjW">
                  <span class="sclae-num s-JGw2lZm6jsjW"> "0.7635"
                  <div class="scale-line s-JGw2lZm6jsjW" style="width: 50px">
          <div class="search-panel-container s-n1WHAIkRHwGF">
            <div class="search-panel-wrapper s-H0d2FahnGNOH">
              <div class="search-list-container s-H0d2FahnGNOH">
                <div class="search-list s-H0d2FahnGNOH">
                  <div class="header-gap s-H0d2FahnGNOH hidden">
                  <div class="result-list s-H0d2FahnGNOH">
                    <div class="count-label s-H0d2FahnGNOH"> "0 Search Results"
                    <button class="add-more-button s-H0d2FahnGNOH hidden">
                      <span class="s-H0d2FahnGNOH"> "Show More"
                  <button class="scroll-up-button s-H0d2FahnGNOH hidden"> "Back to top"
                    <div class="svg-icon s-H0d2FahnGNOH">
                      <svg width="100%" height="100%" viewBox="0 0 59 81" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-24851,-11621)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-top" transform="matrix(1.42616,0,0,1.45578,1277.14,7601.…">
                              <path d="M68.359,-38.135C68.359,-39.16 67.969,-40…" style="fill-rule:nonzero;">
              <div class="search-bar s-H0d2FahnGNOH">
                <div class="svg-icon logo-icon s-H0d2FahnGNOH">
                  <svg width="100%" height="100%" viewBox="0 0 157 184" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                    <g transform="matrix(1,0,0,1,-20300,-9901)">
                      <g transform="matrix(1.30552,0,0,1.07514,20166.5,-141.…">
                        <g id="icon-wizmap" transform="matrix(1,0,0,1,-3205.6,106.033)">
                          <g transform="matrix(1.42038,6.43683,-5.30094,1.72474,…">
                            <path d="M13.503,3.017C14.962,3.017 16.147,8.052 …" style="fill-rule:nonzero;">
                          … 4 more siblings of the same shape
                <input type="text" id="search-bar-input" name="search-query" placeholder="Search WizMap Embeddings" spellcheck="false" class="s-H0d2FahnGNOH">
                <div class="end-button s-H0d2FahnGNOH">
                  <div class="svg-icon search-icon s-H0d2FahnGNOH">
                    <svg width="100%" height="100%" viewBox="0 0 76 77" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24600,-11627)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g id="icon-search" transform="matrix(1.42616,0,0,1.45578,920.494,7607.…">
                            <path d="M8.789,-42.236C8.789,-25.098 22.705,-11.…" style="fill-rule:nonzero;">
                  <button class="svg-icon cancel-icon s-H0d2FahnGNOH hidden">
                    <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24726,-11623)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g transform="matrix(1.42616,0,0,1.45578,-34150.9,-942…">
                            <g id="icon-cancel">
                              <path d="M24765.6,11702.3C24744.1,11702.3 24726.2…" style="fill-rule:nonzero;">
    <script type="module" src="/src/main.ts">
```

## 03-time-menu-open — 311 lines

```
<html lang="en">
  <head>
    <script type="module" src="/@vite/client">
    <meta charset="UTF-8">
    <link rel="icon" href="/favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title> "WizMap"
    <link rel="stylesheet" href="/global.css">
    <style type="text/css" data-vite-dev-id="/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e…"> ".floating-window.s-_i_Kb1cILe8P.s-_i_Kb1cILe8P{position:absolute;max-width:500px;min-width…"
    … 4 more siblings of the same shape
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
    <link href="https://fonts.googleapis.com/css2?family=Lato&display=swap" rel="stylesheet">
  <body>
    <div id="app">
      <div class="stand-alone-page">
        <div class="mapview-page s-n1WHAIkRHwGF">
          <div id="popper-tooltip-top" class="popper-tooltip hidden s-n1WHAIkRHwGF" role="tooltip">
            <span class="popper-content s-n1WHAIkRHwGF">
            <div class="popper-arrow s-n1WHAIkRHwGF">
          <div id="popper-tooltip-bottom" class="popper-tooltip hidden s-n1WHAIkRHwGF" role="tooltip">
            <span class="popper-content s-n1WHAIkRHwGF">
            <div class="popper-arrow s-n1WHAIkRHwGF">
          <div class="app-wrapper s-n1WHAIkRHwGF">
            <div class="main-app s-n1WHAIkRHwGF">
              <div class="main-app-container s-n1WHAIkRHwGF">
                <div class="embedding-wrapper s-ovhWPbaoO3ET">
                  <div class="grab-blocker s-ovhWPbaoO3ET">
                  <div class="embedding s-ovhWPbaoO3ET">
                    <svg class="top-svg s-ovhWPbaoO3ET" width="1440px" height="900px" transform="translate(0, 0)">
                      <g class="top-group" transform="translate(350.0576067369208,-135.4270013…">
                        <rect class="mouse-track-rect" width="1440" height="900">
                        <g class="top-content">
                          <g class="topics-bottom">
                          <g class="topics">
                            <g class="topics-content zoom-6" style="opacity: 1;">
                              <g class="label-group zoom-6">
                                <text class="topic-label left" transform="translate(338.2073240077961, 757.3495798…" paint-order="stroke" style="font-size: 11.5344px; stroke: rgb(255, 2…">
                                  <tspan class="line-1" x="0" y="0"> "summarization-document-"
                                  <tspan class="line-2" x="0" y="0" dy="11.07297970479705"> "summaries-summary"
                                <rect class="topic-tile" x="343.4801714862709" y="756.548731068067" rx="3.295529674046741" ry="3.295529674046741" width="26.97727606918494" height="26.97727606918494" style="stroke-width: 1.31821;">
                                <path class="direction-indicator" transform-origin="center" d="M0,2.472A2.472,2.472,0,1,1,0,-2.472L0,0Z" transform="translate(343.4801714862709, 770.0373691…">
                              … 19 more siblings of the same shape
                              <g class="label-group zoom-6 hidden">
                                <text class="topic-label left" transform="translate(419.1391522153511, 325.7131627…" paint-order="stroke" style="font-size: 11.5344px; stroke: rgb(255, 2…">
                                  <tspan class="line-1" x="0" y="0"> "grammar-parsing-"
                                  <tspan class="line-2" x="0" y="0" dy="11.07297970479705"> "grammars-language"
                                <rect class="topic-tile" x="424.41199969382586" y="324.9123139611072" rx="3.295529674046741" ry="3.295529674046741" width="26.97727606918494" height="26.97727606918494" style="stroke-width: 1.31821;">
                                <path class="direction-indicator" transform-origin="center" d="M0,2.472A2.472,2.472,0,1,1,0,-2.472L0,0Z" transform="translate(424.41199969382586, 338.400951…">
                              … 37 more siblings of the same shape
                          <g class="topics-top">
                          <g class="highlights">
                    <canvas class="search-point-canvas hidden s-ovhWPbaoO3ET" width="1440px" height="900px">
                    <canvas class="embedding-canvas s-ovhWPbaoO3ET faded" width="1440px" height="900px">
                    <canvas class="embedding-canvas-back s-ovhWPbaoO3ET">
                    <canvas class="topic-grid-canvas top s-ovhWPbaoO3ET hidden" width="1440px" height="900px">
                    <canvas class="topic-grid-canvas bottom s-ovhWPbaoO3ET hidden" width="1440px" height="900px">
                    <svg class="embedding-svg s-ovhWPbaoO3ET" width="1440px" height="900px">
                      <g class="umap-group" transform="translate(350.0576067369208,-135.4270013…">
                        <g class="contour-group" style="display: unset; opacity: 0.4;">
                          <path fill="rgb(237, 242, 249)" d="M414.955,762.75L416.25,763.846L418.261,7…">
                          … 10 more siblings of the same shape
                        <g class="contour-group-time">
                          <path fill="rgb(242, 234, 246)" d="M506.025,555.75L504.406,560.25L502.516,5…">
                          … 10 more siblings of the same shape
                  <div class="floating-window-wrapper s-ovhWPbaoO3ET">
                    <div class="floating-window s-_i_Kb1cILe8P hidden">
                      <div class="window-header s-_i_Kb1cILe8P">
                        <div class="window-info s-_i_Kb1cILe8P" title="Window">
                          <span class="window-name s-_i_Kb1cILe8P"> "Point undefined"
                        <div class="control-buttons s-_i_Kb1cILe8P">
                          <div class="control-close s-_i_Kb1cILe8P" title="Close">
                            <div class="svg-icon s-_i_Kb1cILe8P">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
                                <path fill-rule="evenodd" d="M2.343 13.657A8 8 0 1113.657 2.343 8 8 0…">
                      <div class="content s-_i_Kb1cILe8P">
                  <div class="control-bar s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 87 87" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25566,-11721)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-contour2" transform="matrix(1,0,0,1,8.55696,152.857)">
                                  <g transform="matrix(1.45179,-0.397085,0.389006,1.4819…">
                                    <path d="M25612.7,11621C25634.4,11621 25650.2,116…" style="fill:none;stroke:currentColor;stroke-wid…">
                                  … 2 more siblings of the same shape
                        <div class="name s-ovhWPbaoO3ET"> "Contour"
                        <div class="caret s-ovhWPbaoO3ET hidden">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 76 76" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-26227,-11618)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-point">
                                  <g transform="matrix(1.42616,0,0,1.45578,-34359.1,-942…">
                                    <circle cx="26395" cy="11641" r="12">
                                  … 2 more siblings of the same shape
                        <div class="name s-ovhWPbaoO3ET"> "Point"
                        <div class="caret s-ovhWPbaoO3ET hidden">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 76 74" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25694,-11622)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-grid" transform="matrix(1.42616,0,0,1.45578,2479.76,7597.…">
                                  <path d="M13.232,-18.018L80.811,-18.018C82.959,-1…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Grid"
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 86 82" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-26097,-11616)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-label3" transform="matrix(1.42616,0,0,1.45578,3054.77,7590.…">
                                  <path d="M34.277,7.373C36.426,7.373 37.891,6.25 4…" style="fill-rule:nonzero;">
                                  <path d="M46.24,-20.313L60.596,-20.313C62.207,-20…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Label"
                        <div class="caret s-ovhWPbaoO3ET">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                      <button class="menu label-menu s-ovhWPbaoO3ET hidden">
                        <div class="control-item s-ovhWPbaoO3ET">
                          <div class="item-header s-ovhWPbaoO3ET"> "Automatic Labeling"
                          <div class="control-row s-ovhWPbaoO3ET">
                            <input type="checkbox" class="checkbox s-ovhWPbaoO3ET" id="checkbox-label" name="checkbox-label">
                            <label for="checkbox-label" class="s-ovhWPbaoO3ET"> "High Density Region"
                        <div class="control-item slider-item s-ovhWPbaoO3ET">
                          <div class="control-row s-ovhWPbaoO3ET">
                            <label class="slider-label s-ovhWPbaoO3ET" for="slider-label-num"> "Number of Labels"
                            <span class="slider-count s-ovhWPbaoO3ET"> "20"
                          <input type="range" class="slider s-ovhWPbaoO3ET" id="slider-label-num" name="label-num" min="0" max="58">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <button class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 80 79" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25095,-11623)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-time2" transform="matrix(1.42616,0,0,1.45578,1629.42,7602.…">
                                  <path d="M26.709,-30.908L46.191,-30.908C47.9,-30.…" style="fill-rule:nonzero;">
                                  <path d="M46.24,4.15C67.773,4.15 85.693,-13.721 8…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Time"
                        <div class="caret s-ovhWPbaoO3ET activated">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                      <button class="menu time-menu s-ovhWPbaoO3ET">
                        <div class="control-row s-ovhWPbaoO3ET">
                          <div class="play-pause-button s-ovhWPbaoO3ET">
                            <button class="svg-icon s-ovhWPbaoO3ET hidden">
                              <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                                <g transform="matrix(1,0,0,1,-24240,-11783)">
                                  <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                    <g transform="matrix(1.42616,0,0,1.45578,-36227.4,-933…">
                                      <g id="icon-play-solid">
                                        <path d="M25736,11801.4C25714.5,11801.4 25696.5,1…" style="fill-rule:nonzero;">
                            <button class="svg-icon s-ovhWPbaoO3ET">
                              <svg width="100%" height="100%" viewBox="0 0 80 79" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                                <g transform="matrix(1,0,0,1,-24346,-11782)">
                                  <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                    <g transform="matrix(1.42616,0,0,1.45578,-36227.4,-933…">
                                      <g id="icon-pause-solid">
                                        <path d="M25842,11800.3C25820.5,11800.3 25802.5,1…" style="fill-rule:nonzero;">
                          <div class="slider-container s-ovhWPbaoO3ET">
                            <div class="back-slider s-ovhWPbaoO3ET">
                            <div class="slider s-ovhWPbaoO3ET">
                              <div class="range-track s-ovhWPbaoO3ET" style="width: 51.74px;">
                              <div class="middle-thumb s-ovhWPbaoO3ET animating" id="time-slider-middle-thumb" tabindex="-1" style="left: 51.74px;">
                                <div class="thumb-label thumb-label-middle s-ovhWPbaoO3ET">
                                  <span class="thumb-label-span s-ovhWPbaoO3ET"> "1986"
                            <div class="slider-svg-container s-ovhWPbaoO3ET">
                              <svg class="slider-svg s-ovhWPbaoO3ET">
                                <g class="axis-group" fill="none" font-size="10" font-family="sans-serif" text-anchor="middle">
                                  <path class="domain" stroke="currentColor" d="M0.5,9V0.5H400.5V9">
                                  <g class="tick" opacity="1" transform="translate(0.5,0)">
                                    <line stroke="currentColor" y2="9">
                                    <text fill="currentColor" y="12" dy="0.71em"> "1980"
                                  … 4 more siblings of the same shape
          <div class="footer-container s-n1WHAIkRHwGF">
            <div class="footer-wrapper s-JGw2lZm6jsjW">
              <dialog id="dataset-dialog" class="s-JGw2lZm6jsjW">
                <div class="header s-JGw2lZm6jsjW"> "Choose an Embedding"
                <div class="row-block s-JGw2lZm6jsjW">
                  <div class="dataset-list s-JGw2lZm6jsjW">
                    <ul class="s-JGw2lZm6jsjW">
                      <li class="s-JGw2lZm6jsjW">
                        <a href="./?dataset=diffusiondb" class="s-JGw2lZm6jsjW"> "DiffusionDB (1.8M text + 1.8M images)"
                      … 2 more siblings of the same shape
                <div class="separator s-JGw2lZm6jsjW">
                <div class="header s-JGw2lZm6jsjW"> "My Own Embedding"
                <div class="input-form s-JGw2lZm6jsjW">
                  <div class="row s-JGw2lZm6jsjW">
                    <span class="row-header s-JGw2lZm6jsjW"> "Data JSON URL"
                      <a href="https://github.com/poloclub/wizmap#use-my-own-embeddings" target="_blank" class="s-JGw2lZm6jsjW"> "(what is this?)"
                    <input placeholder="https://xxx.ndjson" class="s-JGw2lZm6jsjW">
                  <div class="row s-JGw2lZm6jsjW">
                    <span class="row-header s-JGw2lZm6jsjW"> "Grid JSON URL"
                      <a href="https://github.com/poloclub/wizmap#use-my-own-embeddings" target="_blank" class="s-JGw2lZm6jsjW"> "(what is this?)"
                    <input placeholder="https://xxx.json" class="s-JGw2lZm6jsjW">
                <div class="button-block s-JGw2lZm6jsjW">
                  <button class="close-button s-JGw2lZm6jsjW"> "Create"
                  <button class="close-button s-JGw2lZm6jsjW"> "Close"
              <div class="zoom-control s-JGw2lZm6jsjW">
                <button class="zoom-button zoom-button-reset s-JGw2lZm6jsjW">
                  <div class="svg-icon s-JGw2lZm6jsjW">
                    <svg width="100%" height="100%" viewBox="0 0 88 71" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24474,-11788)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g id="icon-folder" transform="matrix(1.42616,0,0,1.45578,739.303,7837.…">
                            <path d="M22.217,-0.098L86.279,-0.098C93.213,-0.0…" style="fill-rule:nonzero;">
              … 2 more siblings of the same shape
              <div class="footer s-JGw2lZm6jsjW">
                <span class="name s-JGw2lZm6jsjW"> "WizMap"
                  <span class="svg-icon s-JGw2lZm6jsjW">
                    <svg width="100%" height="100%" viewBox="0 0 157 184" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-20300,-9901)">
                        <g transform="matrix(1.30552,0,0,1.07514,20166.5,-141.…">
                          <g id="icon-wizmap" transform="matrix(1,0,0,1,-3205.6,106.033)">
                            <g transform="matrix(1.42038,6.43683,-5.30094,1.72474,…">
                              <path d="M13.503,3.017C14.962,3.017 16.147,8.052 …" style="fill-rule:nonzero;">
                            … 4 more siblings of the same shape
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://arxiv.org/abs/2306.09328" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Paper"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg width="100%" height="100%" viewBox="0 0 66 83" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-23997,-11783)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-file" transform="matrix(1.42616,0,0,1.45578,59.3956,7838.…">
                              <path d="M22.022,5.908L62.5,5.908C70.703,5.908 74…" style="fill-rule:nonzero;">
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://github.com/poloclub/wizmap" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Code"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 512">
                        <path d="M186.1 328.7c0 20.9-10.9 55.1-36.7 55.1s…">
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://youtu.be/8fJG87QVceQ" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Video"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-24106,-11783)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-play" transform="matrix(1.42616,0,0,1.45578,219.154,7836.…">
                              <path d="M46.24,4.15C67.773,4.15 85.693,-13.721 8…" style="fill-rule:nonzero;">
                              <path d="M39.16,-20.313L60.889,-33.106C62.598,-34…" style="fill-rule:nonzero;">
                <div class="splitter s-JGw2lZm6jsjW">
                <button class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "ACL Abstracts"
                <div class="splitter s-JGw2lZm6jsjW">
                <span class="count s-JGw2lZm6jsjW">
                  <span class="total-count s-JGw2lZm6jsjW hidden"> "63,213 Data Points"
                  <span class="subset-count s-JGw2lZm6jsjW"> "178 Data Points"
                <div class="splitter s-JGw2lZm6jsjW">
                <div class="scale-legend s-JGw2lZm6jsjW">
                  <span class="sclae-num s-JGw2lZm6jsjW"> "0.7635"
                  <div class="scale-line s-JGw2lZm6jsjW" style="width: 50px">
          <div class="search-panel-container s-n1WHAIkRHwGF">
            <div class="search-panel-wrapper s-H0d2FahnGNOH">
              <div class="search-list-container s-H0d2FahnGNOH">
                <div class="search-list s-H0d2FahnGNOH">
                  <div class="header-gap s-H0d2FahnGNOH hidden">
                  <div class="result-list s-H0d2FahnGNOH">
                    <div class="count-label s-H0d2FahnGNOH"> "0 Search Results"
                    <button class="add-more-button s-H0d2FahnGNOH hidden">
                      <span class="s-H0d2FahnGNOH"> "Show More"
                  <button class="scroll-up-button s-H0d2FahnGNOH hidden"> "Back to top"
                    <div class="svg-icon s-H0d2FahnGNOH">
                      <svg width="100%" height="100%" viewBox="0 0 59 81" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-24851,-11621)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-top" transform="matrix(1.42616,0,0,1.45578,1277.14,7601.…">
                              <path d="M68.359,-38.135C68.359,-39.16 67.969,-40…" style="fill-rule:nonzero;">
              <div class="search-bar s-H0d2FahnGNOH">
                <div class="svg-icon logo-icon s-H0d2FahnGNOH">
                  <svg width="100%" height="100%" viewBox="0 0 157 184" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                    <g transform="matrix(1,0,0,1,-20300,-9901)">
                      <g transform="matrix(1.30552,0,0,1.07514,20166.5,-141.…">
                        <g id="icon-wizmap" transform="matrix(1,0,0,1,-3205.6,106.033)">
                          <g transform="matrix(1.42038,6.43683,-5.30094,1.72474,…">
                            <path d="M13.503,3.017C14.962,3.017 16.147,8.052 …" style="fill-rule:nonzero;">
                          … 4 more siblings of the same shape
                <input type="text" id="search-bar-input" name="search-query" placeholder="Search WizMap Embeddings" spellcheck="false" class="s-H0d2FahnGNOH">
                <div class="end-button s-H0d2FahnGNOH">
                  <div class="svg-icon search-icon s-H0d2FahnGNOH">
                    <svg width="100%" height="100%" viewBox="0 0 76 77" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24600,-11627)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g id="icon-search" transform="matrix(1.42616,0,0,1.45578,920.494,7607.…">
                            <path d="M8.789,-42.236C8.789,-25.098 22.705,-11.…" style="fill-rule:nonzero;">
                  <button class="svg-icon cancel-icon s-H0d2FahnGNOH hidden">
                    <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24726,-11623)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g transform="matrix(1.42616,0,0,1.45578,-34150.9,-942…">
                            <g id="icon-cancel">
                              <path d="M24765.6,11702.3C24744.1,11702.3 24726.2…" style="fill-rule:nonzero;">
    <script type="module" src="/src/main.ts">
```

## 04-search-results — 315 lines

```
<html lang="en">
  <head>
    <script type="module" src="/@vite/client">
    <meta charset="UTF-8">
    <link rel="icon" href="/favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title> "WizMap"
    <link rel="stylesheet" href="/global.css">
    <style type="text/css" data-vite-dev-id="/private/tmp/claude-501/-Users-divadbaroon-Desktop-engelbart-web/9513afc7-e24b-43db-8b54-e…"> ".floating-window.s-_i_Kb1cILe8P.s-_i_Kb1cILe8P{position:absolute;max-width:500px;min-width…"
    … 4 more siblings of the same shape
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
    <link href="https://fonts.googleapis.com/css2?family=Lato&display=swap" rel="stylesheet">
  <body>
    <div id="app">
      <div class="stand-alone-page">
        <div class="mapview-page s-n1WHAIkRHwGF">
          <div id="popper-tooltip-top" class="popper-tooltip hidden s-n1WHAIkRHwGF" role="tooltip">
            <span class="popper-content s-n1WHAIkRHwGF">
            <div class="popper-arrow s-n1WHAIkRHwGF">
          <div id="popper-tooltip-bottom" class="popper-tooltip hidden s-n1WHAIkRHwGF" role="tooltip">
            <span class="popper-content s-n1WHAIkRHwGF">
            <div class="popper-arrow s-n1WHAIkRHwGF">
          <div class="app-wrapper s-n1WHAIkRHwGF">
            <div class="main-app s-n1WHAIkRHwGF">
              <div class="main-app-container s-n1WHAIkRHwGF">
                <div class="embedding-wrapper s-ovhWPbaoO3ET">
                  <div class="grab-blocker s-ovhWPbaoO3ET">
                  <div class="embedding s-ovhWPbaoO3ET">
                    <svg class="top-svg s-ovhWPbaoO3ET" width="1440px" height="900px" transform="translate(0, 0)">
                      <g class="top-group" transform="translate(350.0576067369208,-135.4270013…">
                        <rect class="mouse-track-rect" width="1440" height="900">
                        <g class="top-content">
                          <g class="topics-bottom">
                          <g class="topics">
                            <g class="topics-content zoom-6" style="opacity: 1;">
                              <g class="label-group zoom-6">
                                <text class="topic-label left" transform="translate(338.2073240077961, 757.3495798…" paint-order="stroke" style="font-size: 11.5344px; stroke: rgb(255, 2…">
                                  <tspan class="line-1" x="0" y="0"> "summarization-document-"
                                  <tspan class="line-2" x="0" y="0" dy="11.07297970479705"> "summaries-summary"
                                <rect class="topic-tile" x="343.4801714862709" y="756.548731068067" rx="3.295529674046741" ry="3.295529674046741" width="26.97727606918494" height="26.97727606918494" style="stroke-width: 1.31821;">
                                <path class="direction-indicator" transform-origin="center" d="M0,2.472A2.472,2.472,0,1,1,0,-2.472L0,0Z" transform="translate(343.4801714862709, 770.0373691…">
                              … 19 more siblings of the same shape
                              <g class="label-group zoom-6 hidden">
                                <text class="topic-label left" transform="translate(419.1391522153511, 325.7131627…" paint-order="stroke" style="font-size: 11.5344px; stroke: rgb(255, 2…">
                                  <tspan class="line-1" x="0" y="0"> "grammar-parsing-"
                                  <tspan class="line-2" x="0" y="0" dy="11.07297970479705"> "grammars-language"
                                <rect class="topic-tile" x="424.41199969382586" y="324.9123139611072" rx="3.295529674046741" ry="3.295529674046741" width="26.97727606918494" height="26.97727606918494" style="stroke-width: 1.31821;">
                                <path class="direction-indicator" transform-origin="center" d="M0,2.472A2.472,2.472,0,1,1,0,-2.472L0,0Z" transform="translate(424.41199969382586, 338.400951…">
                              … 37 more siblings of the same shape
                          <g class="topics-top">
                          <g class="highlights">
                    <canvas class="search-point-canvas s-ovhWPbaoO3ET" width="1440px" height="900px">
                    <canvas class="embedding-canvas s-ovhWPbaoO3ET faded" width="1440px" height="900px">
                    <canvas class="embedding-canvas-back s-ovhWPbaoO3ET">
                    <canvas class="topic-grid-canvas top s-ovhWPbaoO3ET hidden" width="1440px" height="900px">
                    <canvas class="topic-grid-canvas bottom s-ovhWPbaoO3ET hidden" width="1440px" height="900px">
                    <svg class="embedding-svg s-ovhWPbaoO3ET" width="1440px" height="900px">
                      <g class="umap-group" transform="translate(350.0576067369208,-135.4270013…">
                        <g class="contour-group" style="display: unset;">
                          <path fill="rgb(237, 242, 249)" d="M414.955,762.75L416.25,763.846L418.261,7…">
                          … 10 more siblings of the same shape
                        <g class="contour-group-time hidden">
                          <path fill="rgb(242, 234, 246)" d="M506.025,555.75L504.406,560.25L502.516,5…">
                          … 10 more siblings of the same shape
                  <div class="floating-window-wrapper s-ovhWPbaoO3ET">
                    <div class="floating-window s-_i_Kb1cILe8P hidden">
                      <div class="window-header s-_i_Kb1cILe8P">
                        <div class="window-info s-_i_Kb1cILe8P" title="Window">
                          <span class="window-name s-_i_Kb1cILe8P"> "Point undefined"
                        <div class="control-buttons s-_i_Kb1cILe8P">
                          <div class="control-close s-_i_Kb1cILe8P" title="Close">
                            <div class="svg-icon s-_i_Kb1cILe8P">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
                                <path fill-rule="evenodd" d="M2.343 13.657A8 8 0 1113.657 2.343 8 8 0…">
                      <div class="content s-_i_Kb1cILe8P">
                  <div class="control-bar s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 87 87" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25566,-11721)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-contour2" transform="matrix(1,0,0,1,8.55696,152.857)">
                                  <g transform="matrix(1.45179,-0.397085,0.389006,1.4819…">
                                    <path d="M25612.7,11621C25634.4,11621 25650.2,116…" style="fill:none;stroke:currentColor;stroke-wid…">
                                  … 2 more siblings of the same shape
                        <div class="name s-ovhWPbaoO3ET"> "Contour"
                        <div class="caret s-ovhWPbaoO3ET hidden">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 76 76" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-26227,-11618)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-point">
                                  <g transform="matrix(1.42616,0,0,1.45578,-34359.1,-942…">
                                    <circle cx="26395" cy="11641" r="12">
                                  … 2 more siblings of the same shape
                        <div class="name s-ovhWPbaoO3ET"> "Point"
                        <div class="caret s-ovhWPbaoO3ET hidden">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 76 74" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25694,-11622)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-grid" transform="matrix(1.42616,0,0,1.45578,2479.76,7597.…">
                                  <path d="M13.232,-18.018L80.811,-18.018C82.959,-1…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Grid"
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <div class="item s-ovhWPbaoO3ET activated">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 86 82" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-26097,-11616)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-label3" transform="matrix(1.42616,0,0,1.45578,3054.77,7590.…">
                                  <path d="M34.277,7.373C36.426,7.373 37.891,6.25 4…" style="fill-rule:nonzero;">
                                  <path d="M46.24,-20.313L60.596,-20.313C62.207,-20…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Label"
                        <div class="caret s-ovhWPbaoO3ET">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                      <button class="menu label-menu s-ovhWPbaoO3ET hidden">
                        <div class="control-item s-ovhWPbaoO3ET">
                          <div class="item-header s-ovhWPbaoO3ET"> "Automatic Labeling"
                          <div class="control-row s-ovhWPbaoO3ET">
                            <input type="checkbox" class="checkbox s-ovhWPbaoO3ET" id="checkbox-label" name="checkbox-label">
                            <label for="checkbox-label" class="s-ovhWPbaoO3ET"> "High Density Region"
                        <div class="control-item slider-item s-ovhWPbaoO3ET">
                          <div class="control-row s-ovhWPbaoO3ET">
                            <label class="slider-label s-ovhWPbaoO3ET" for="slider-label-num"> "Number of Labels"
                            <span class="slider-count s-ovhWPbaoO3ET"> "20"
                          <input type="range" class="slider s-ovhWPbaoO3ET" id="slider-label-num" name="label-num" min="0" max="58">
                    <div class="flex-gap s-ovhWPbaoO3ET">
                    <button class="item-wrapper s-ovhWPbaoO3ET">
                      <button class="item s-ovhWPbaoO3ET">
                        <div class="svg-icon s-ovhWPbaoO3ET">
                          <svg width="100%" height="100%" viewBox="0 0 80 79" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                            <g transform="matrix(1,0,0,1,-25095,-11623)">
                              <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                <g id="icon-time2" transform="matrix(1.42616,0,0,1.45578,1629.42,7602.…">
                                  <path d="M26.709,-30.908L46.191,-30.908C47.9,-30.…" style="fill-rule:nonzero;">
                                  <path d="M46.24,4.15C67.773,4.15 85.693,-13.721 8…" style="fill-rule:nonzero;">
                        <div class="name s-ovhWPbaoO3ET"> "Time"
                        <div class="caret s-ovhWPbaoO3ET">
                          <div class="svg-icon s-ovhWPbaoO3ET">
                            <svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512">
                              <path d="M98 190.06l139.78 163.12a24 24 0 0036.44…">
                      <button class="menu time-menu s-ovhWPbaoO3ET hidden">
                        <div class="control-row s-ovhWPbaoO3ET">
                          <div class="play-pause-button s-ovhWPbaoO3ET">
                            <button class="svg-icon s-ovhWPbaoO3ET hidden">
                              <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                                <g transform="matrix(1,0,0,1,-24240,-11783)">
                                  <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                    <g transform="matrix(1.42616,0,0,1.45578,-36227.4,-933…">
                                      <g id="icon-play-solid">
                                        <path d="M25736,11801.4C25714.5,11801.4 25696.5,1…" style="fill-rule:nonzero;">
                            <button class="svg-icon s-ovhWPbaoO3ET">
                              <svg width="100%" height="100%" viewBox="0 0 80 79" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                                <g transform="matrix(1,0,0,1,-24346,-11782)">
                                  <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                                    <g transform="matrix(1.42616,0,0,1.45578,-36227.4,-933…">
                                      <g id="icon-pause-solid">
                                        <path d="M25842,11800.3C25820.5,11800.3 25802.5,1…" style="fill-rule:nonzero;">
                          <div class="slider-container s-ovhWPbaoO3ET">
                            <div class="back-slider s-ovhWPbaoO3ET">
                            <div class="slider s-ovhWPbaoO3ET">
                              <div class="range-track s-ovhWPbaoO3ET" style="width: 51.74px;">
                              <div class="middle-thumb s-ovhWPbaoO3ET animating" id="time-slider-middle-thumb" tabindex="-1" style="left: 51.74px;">
                                <div class="thumb-label thumb-label-middle s-ovhWPbaoO3ET">
                                  <span class="thumb-label-span s-ovhWPbaoO3ET"> "1986"
                            <div class="slider-svg-container s-ovhWPbaoO3ET">
                              <svg class="slider-svg s-ovhWPbaoO3ET">
                                <g class="axis-group" fill="none" font-size="10" font-family="sans-serif" text-anchor="middle">
                                  <path class="domain" stroke="currentColor" d="M0.5,9V0.5H400.5V9">
                                  <g class="tick" opacity="1" transform="translate(0.5,0)">
                                    <line stroke="currentColor" y2="9">
                                    <text fill="currentColor" y="12" dy="0.71em"> "1980"
                                  … 4 more siblings of the same shape
          <div class="footer-container s-n1WHAIkRHwGF">
            <div class="footer-wrapper s-JGw2lZm6jsjW">
              <dialog id="dataset-dialog" class="s-JGw2lZm6jsjW">
                <div class="header s-JGw2lZm6jsjW"> "Choose an Embedding"
                <div class="row-block s-JGw2lZm6jsjW">
                  <div class="dataset-list s-JGw2lZm6jsjW">
                    <ul class="s-JGw2lZm6jsjW">
                      <li class="s-JGw2lZm6jsjW">
                        <a href="./?dataset=diffusiondb" class="s-JGw2lZm6jsjW"> "DiffusionDB (1.8M text + 1.8M images)"
                      … 2 more siblings of the same shape
                <div class="separator s-JGw2lZm6jsjW">
                <div class="header s-JGw2lZm6jsjW"> "My Own Embedding"
                <div class="input-form s-JGw2lZm6jsjW">
                  <div class="row s-JGw2lZm6jsjW">
                    <span class="row-header s-JGw2lZm6jsjW"> "Data JSON URL"
                      <a href="https://github.com/poloclub/wizmap#use-my-own-embeddings" target="_blank" class="s-JGw2lZm6jsjW"> "(what is this?)"
                    <input placeholder="https://xxx.ndjson" class="s-JGw2lZm6jsjW">
                  <div class="row s-JGw2lZm6jsjW">
                    <span class="row-header s-JGw2lZm6jsjW"> "Grid JSON URL"
                      <a href="https://github.com/poloclub/wizmap#use-my-own-embeddings" target="_blank" class="s-JGw2lZm6jsjW"> "(what is this?)"
                    <input placeholder="https://xxx.json" class="s-JGw2lZm6jsjW">
                <div class="button-block s-JGw2lZm6jsjW">
                  <button class="close-button s-JGw2lZm6jsjW"> "Create"
                  <button class="close-button s-JGw2lZm6jsjW"> "Close"
              <div class="zoom-control s-JGw2lZm6jsjW">
                <button class="zoom-button zoom-button-reset s-JGw2lZm6jsjW">
                  <div class="svg-icon s-JGw2lZm6jsjW">
                    <svg width="100%" height="100%" viewBox="0 0 88 71" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24474,-11788)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g id="icon-folder" transform="matrix(1.42616,0,0,1.45578,739.303,7837.…">
                            <path d="M22.217,-0.098L86.279,-0.098C93.213,-0.0…" style="fill-rule:nonzero;">
              … 2 more siblings of the same shape
              <div class="footer s-JGw2lZm6jsjW">
                <span class="name s-JGw2lZm6jsjW"> "WizMap"
                  <span class="svg-icon s-JGw2lZm6jsjW">
                    <svg width="100%" height="100%" viewBox="0 0 157 184" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-20300,-9901)">
                        <g transform="matrix(1.30552,0,0,1.07514,20166.5,-141.…">
                          <g id="icon-wizmap" transform="matrix(1,0,0,1,-3205.6,106.033)">
                            <g transform="matrix(1.42038,6.43683,-5.30094,1.72474,…">
                              <path d="M13.503,3.017C14.962,3.017 16.147,8.052 …" style="fill-rule:nonzero;">
                            … 4 more siblings of the same shape
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://arxiv.org/abs/2306.09328" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Paper"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg width="100%" height="100%" viewBox="0 0 66 83" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-23997,-11783)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-file" transform="matrix(1.42616,0,0,1.45578,59.3956,7838.…">
                              <path d="M22.022,5.908L62.5,5.908C70.703,5.908 74…" style="fill-rule:nonzero;">
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://github.com/poloclub/wizmap" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Code"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 512">
                        <path d="M186.1 328.7c0 20.9-10.9 55.1-36.7 55.1s…">
                <div class="splitter s-JGw2lZm6jsjW">
                <a href="https://youtu.be/8fJG87QVceQ" class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "Video"
                    <span class="svg-icon s-JGw2lZm6jsjW">
                      <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-24106,-11783)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-play" transform="matrix(1.42616,0,0,1.45578,219.154,7836.…">
                              <path d="M46.24,4.15C67.773,4.15 85.693,-13.721 8…" style="fill-rule:nonzero;">
                              <path d="M39.16,-20.313L60.889,-33.106C62.598,-34…" style="fill-rule:nonzero;">
                <div class="splitter s-JGw2lZm6jsjW">
                <button class="s-JGw2lZm6jsjW">
                  <span class="item s-JGw2lZm6jsjW"> "ACL Abstracts"
                <div class="splitter s-JGw2lZm6jsjW">
                <span class="count s-JGw2lZm6jsjW">
                  <span class="total-count s-JGw2lZm6jsjW"> "63,213 Data Points"
                  <span class="subset-count s-JGw2lZm6jsjW hidden"> "63213 Data Points"
                <div class="splitter s-JGw2lZm6jsjW">
                <div class="scale-legend s-JGw2lZm6jsjW">
                  <span class="sclae-num s-JGw2lZm6jsjW"> "0.7635"
                  <div class="scale-line s-JGw2lZm6jsjW" style="width: 50px">
          <div class="search-panel-container s-n1WHAIkRHwGF">
            <div class="search-panel-wrapper s-H0d2FahnGNOH">
              <div class="search-list-container s-H0d2FahnGNOH shown">
                <div class="search-list s-H0d2FahnGNOH">
                  <div class="header-gap s-H0d2FahnGNOH hidden">
                  <div class="result-list s-H0d2FahnGNOH">
                    <div class="count-label s-H0d2FahnGNOH"> "5000+ Search Results"
                    <div class="item s-H0d2FahnGNOH clamp-line"> "[improved language modeling for statistical machine ] statistical machine systems use a co…"
                      <em> "translation"
                      … 6 more siblings of the same shape
                    … 99 more siblings of the same shape
                    <button class="add-more-button s-H0d2FahnGNOH">
                      <span class="s-H0d2FahnGNOH"> "Show More"
                  <button class="scroll-up-button s-H0d2FahnGNOH hidden"> "Back to top"
                    <div class="svg-icon s-H0d2FahnGNOH">
                      <svg width="100%" height="100%" viewBox="0 0 59 81" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                        <g transform="matrix(1,0,0,1,-24851,-11621)">
                          <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                            <g id="icon-top" transform="matrix(1.42616,0,0,1.45578,1277.14,7601.…">
                              <path d="M68.359,-38.135C68.359,-39.16 67.969,-40…" style="fill-rule:nonzero;">
              <div class="search-bar s-H0d2FahnGNOH focused">
                <div class="svg-icon logo-icon s-H0d2FahnGNOH">
                  <svg width="100%" height="100%" viewBox="0 0 157 184" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                    <g transform="matrix(1,0,0,1,-20300,-9901)">
                      <g transform="matrix(1.30552,0,0,1.07514,20166.5,-141.…">
                        <g id="icon-wizmap" transform="matrix(1,0,0,1,-3205.6,106.033)">
                          <g transform="matrix(1.42038,6.43683,-5.30094,1.72474,…">
                            <path d="M13.503,3.017C14.962,3.017 16.147,8.052 …" style="fill-rule:nonzero;">
                          … 4 more siblings of the same shape
                <input type="text" id="search-bar-input" name="search-query" placeholder="Search WizMap Embeddings" spellcheck="false" class="s-H0d2FahnGNOH">
                <div class="end-button s-H0d2FahnGNOH">
                  <div class="svg-icon search-icon s-H0d2FahnGNOH hidden">
                    <svg width="100%" height="100%" viewBox="0 0 76 77" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24600,-11627)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g id="icon-search" transform="matrix(1.42616,0,0,1.45578,920.494,7607.…">
                            <path d="M8.789,-42.236C8.789,-25.098 22.705,-11.…" style="fill-rule:nonzero;">
                  <button class="svg-icon cancel-icon s-H0d2FahnGNOH">
                    <svg width="100%" height="100%" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stro…">
                      <g transform="matrix(1,0,0,1,-24726,-11623)">
                        <g transform="matrix(0.701184,0,0,0.686918,23946,6475.…">
                          <g transform="matrix(1.42616,0,0,1.45578,-34150.9,-942…">
                            <g id="icon-cancel">
                              <path d="M24765.6,11702.3C24744.1,11702.3 24726.2…" style="fill-rule:nonzero;">
    <script type="module" src="/src/main.ts">
```
