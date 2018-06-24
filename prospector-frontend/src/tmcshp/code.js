'use strict';

'''
SFCTA PROSPECTOR: Data visualization platform.

Copyright (C) 2018 San Francisco County Transportation Authority
and respective authors. See Git history for individual contributions.

This program is free software: you can redistribute it and/or modify
it under the terms of the Apache License version 2.0, as published
by the Apache Foundation, or any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the Apache License for more details.

You should have received a copy of the Apache License along with
this program. If not, see <https://www.apache.org/licenses/LICENSE-2.0>.
'''

// Must use npm and babel to support IE11/Safari
import 'isomorphic-fetch';
import vueSlider from 'vue-slider-component';
import Cookies from 'js-cookie';

var maplib = require('../jslib/maplib');
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML;
let mymap = maplib.sfmap;
mymap.setView([37.76889, -122.440997], 13);

// some important global variables.
const API_SERVER = 'https://api.sfcta.org/api/';
const GEO_VIEW1 = 'tmc_segments';
const GEO_VIEW2 = 'tmc_trueshp';

let color_styles = [{ normal  : {"color": "#39f", "weight":3,  "opacity": 0.5, "dashArray": '5 5'},
                    selected: {"color": "#33f",    "weight":4, "opacity": 0.5, "dashArray": '5 5' },},
                    { normal  : {"color": "#3c6", "weight":4,  "opacity": 1.0, },
                    selected: {"color": "#34784b", "weight":5, "opacity": 1.0, },}
];

let geoLayer_tmcseg;
let geoLayer_tmcshp;

let info = L.control();
info.onAdd = function (map) {
  this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
  this.update();
  return this._div;
};
info.update = function (props) {
  this._div.innerHTML = '<h4>Information</h4>' +
      '<b> TMC ID: ' +
      (props ?
      '<b>' + props.tmc + '</b>': 'Hover over a TMC');
};
info.addTo(mymap);

function queryServer(url, i){
  fetch(url)
  .then((resp) => resp.json())
  .then(function(jsonData) {
    return addGeoLayer(jsonData, i);
  })
  .catch(function(error) {
    console.log("err: "+error);
  });
}

function addGeoLayer(jsonData, i){
  for (let segment of jsonData) {
    segment["type"] = "Feature";
    segment["geometry"] = JSON.parse(segment.geometry);
  }
  let geolyr = L.geoJSON(jsonData,{
    style: color_styles[i].normal,
    onEachFeature: function(feature, layer) {
      layer.on({
                mouseover: function(e){
                  e.target.setStyle(color_styles[i].selected);
                  e.target.bringToFront();
                  info.update(e.target.feature);
                },
                mouseout: function(e){
                  geolyr.resetStyle(e.target);
                  info.update(null);
                },
      });
    }
  });
  geolyr.addTo(mymap);
  return geolyr
}

geoLayer_tmcseg = queryServer(API_SERVER+GEO_VIEW1, 0);
geoLayer_tmcshp = queryServer(API_SERVER+GEO_VIEW2, 1);



