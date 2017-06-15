---
layout: default
title: Home
---

# Welcome to the **SFCTA Prospector** data visualization portal.

Pick a dataset to explore:

<div class="posts">
  {% for node in site.pages -%}
    {% if node.title != null -%}
      {% if node.layout == "page" -%}
        <a href="{{ node.url }}">
        <div class="dataset-thumbnail">
          <img class="thumbnail-image" src="{{node.folder}}/{{node.thumbnail}}" />
          <h5 class="thumbnail-title">{{ node.title }}</h5>
        </div>
        </a>
      {% endif -%}
    {% endif -%}
  {% endfor -%}
</div>
