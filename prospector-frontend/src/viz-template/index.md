---
layout: page
title: Visualization Template
css: main.css
---

## Viz Template

Add your own visualization here.

<div id="panel">
    <div class="dashboard">
      <div id="picker">
        <div class="column1">
          <button v-on:click="pickAM" v-bind:class="{ active: isAMactive }"
                   class="small ui inverted red button">AM</button>
          <button v-on:click="pickPM" v-bind:class="{ active: isPMactive }"
                   class="small ui inverted blue button">PM</button>
        </div>
      </div>
    </div>
</div>

<br/>

<div id="sfmap"></div>

<script type="application/javascript" src="/bundles/viz-template.js"></script>
