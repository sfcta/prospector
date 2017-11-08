'use strict';

// Use npm and babel to support IE11/Safari
import 'babel-polyfill';
import 'isomorphic-fetch';
import vueSlider from 'vue-slider-component';
import vSelect from 'vue-select';
Vue.component('v-select', vSelect);

let api_server = 'http://api.sfcta.org/api/';
const GEO_VIEW = 'taz_boundaries';
const TABLES_VIEW = 'walkskim_tables';
const MISSING_COLOR = '#ccc';
const DISTANCE_BINS = [0, 0.25, 0.5, 1, 5, 20, 50]
const DISTANCE_COLORS = ['#ccc', '#1a9850', '#91cf60', '#d9ef8b', '#ffffbf', '#fee08b', '#fc8d59', '#d73027']
const DEFAULT_ZOOM = 12;

let segmentLayer;
let selectedGeo, popupSegment, hoverColor, popupColor;
let speedCache = {};

let maplib = require('../jslib/maplib');
let mymap = maplib.sfmap;
let iconOrig = maplib.iconOrig;
let iconDest = maplib.iconDest;
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML;
let geoColorFunc = maplib.colorFunc.distance;
let geoLayer;
let selTAZProps;
let bikeicon = new L.icon({iconUrl: 'bike.png', iconSize: [20, 20], iconAnchor: [20,10]}),
    pedestrianicon = new L.icon({iconURL: 'pedestrian.png', iconSize: [20, 20], iconAnchor: [20,10]});

mymap.setView([37.77, -122.42], DEFAULT_ZOOM);

bikemarker = L.marker([37.77, -122.43], {icon: bikeicon}).addTo(mymap);
pedestrianmarker = L.marker([37.77, -122.42], {icon: pedestrianicon}).addTo(mymap);

