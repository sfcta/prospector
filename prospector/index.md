---
layout: default
title: Home
---

# Welcome to the **SFCTA Prospector** data visualization portal.

Pick a dataset to explore:

<div class="posts">
  {% for node in site.pages %}
    {% if node.title != null %}
      {% if node.layout == "page" %}
        <div class="dataset-thumbnail">
          <img width="250px" src="{{node.folder}}/{{node.thumbnail}}" />
          <h5 style="vertical-align:top;"><a href="{{ node.url }}">{{ node.title }}</a></h5>
        </div>
      {% endif %}
    {% endif %}
  {% endfor %}
</div>

