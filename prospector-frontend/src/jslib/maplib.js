/*
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
*/

let theme = "light";
let sfmap = L.map('sfmap').setView([37.77, -122.42], 12);
let url = 'https://api.mapbox.com/styles/v1/mapbox/'+theme+'-v9/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
let token = 'pk.eyJ1Ijoic2ZjdGEiLCJhIjoiY2ozdXBhNm1mMDFkaTJ3dGRmZHFqanRuOCJ9.KDmACTJBGNA6l0CyPi1Luw';
let attribution ='<a href="https://openstreetmap.org">OpenStreetMap</a> | ' +
                 '<a href="https://mapbox.com">Mapbox</a>';
let baseLayer = L.tileLayer(url, {
  attribution:attribution,
  maxZoom: 18,
  accessToken:token,
}).addTo(sfmap);

let dark_styles = { normal  : {"color": "#ff7800", "weight":4,  "opacity": 1.0, },
                    selected: {"color": "#39f",    "weight":5, "opacity": 1.0, },
                    popup   : {"color": "#33f",    "weight":10, "opacity": 1.0, },
};

let light_styles = {normal  : {"color": "#3c6", "weight": 4, "opacity": 1.0 },
                    selected: {"color": "#39f", "weight": 5, "opacity": 1.0 },
                    popup   : {"color": "#33f", "weight": 10, "opacity": 1.0 }
};
let styles = (theme==='dark' ? dark_styles : light_styles);


let iconOrig = L.AwesomeMarkers.icon({
    prefix: 'ion',
    icon: 'star',
    markerColor:'green',
  });

let iconDest = L.AwesomeMarkers.icon({
    prefix: 'ion',
    icon: 'flag',
    markerColor:'red',
  });

function getDistColor(d){
  return d > 50     ? '#d73027' :
         d > 20     ? '#fc8d59' :
         d > 5      ? '#fee08b' :
         d > 1      ? '#ffffbf' :
         d > 0.5    ? '#d9ef8b' :
         d > .25    ? '#91cf60' :
         d > 0      ? '#1a9850' :
                      '#ccc';
}

function getColorByBin(x, bins, colors){
  for (var i=0; i < bins.length; i++){
    if (x <= bins[i]) return colors[i];
  }
  return colors[i];
}

function getColorFromVal(x, vals, colors, bins=true){
  if (x==null) return null;

  if(bins){
    for (var i=0; i < vals.length; i++){
      if (x <= vals[i]) return colors[i];
    }
    return colors[i];
  } else{
    return colors[vals.indexOf(x)];
  }
}

function getColorFromVal2(x, vals, colors, bins=true){
  if (x==null) return null;

  if(bins){
    if (x < vals[0] || x > vals[vals.length-1]) {
      return null;
    } else {
      for (var i=1; i < vals.length; i++){
        if (x <= vals[i]) return colors[i-1];
      }
    }
  } else{
    return colors[vals.indexOf(x)];
  }
}

// this default implementation assigns the last color to any value beyond the last threshold
function getLegHTML(vals, colors, bins=true, postunits=''){
  let ret = '';
  if(bins){
    // loop through our bin intervals and generate a label with a colored square for each interval
    for (var i = 0; i < vals.length; i++) {
      ret +=
          '<p class="legend-row"><div style="background:' + colors[i+1] + '">&nbsp;&nbsp;</div> '
          + vals[i] + postunits
          + (vals[i + 1] ? ' &ndash; ' + vals[i + 1] + postunits + '<br>' : '+')
          + '</p>';
    }
  } else{
    for (var i = 0; i < vals.length; i++) {
      ret +=
          '<p class="legend-row"><i style="background:'
          + colors[i] + '"></i> '
          + vals[i] + postunits + (vals[i + 1] ? '<br>' : '')
          + '</p>';
    }
  }
  return ret;
}

// this variation is to only assign colors to values in the range passed in as input
function getLegHTML2(vals, colors, bins=true, postunits='', reverse=false){
  let ret = '';
  if(bins){
    // loop through our bin intervals and generate a label with a colored square for each interval
    if (reverse) {
      for (var i = vals.length-2; i >= 0; i--) {
        ret +=
            '<p class="legend-row"><i style="background:' + colors[i] + '"></i> '
            + (i==0 ? vals[i+1] + postunits + ' or less' : ((i==vals.length-2)? ('more than ' + vals[i] + postunits) : (vals[i] + postunits + ' &ndash; ')))
            + ((i==0)? '' : (i==vals.length-2? '<br>' : vals[i+1] + postunits + '<br>'))
            + '</p>';
      }      
    } else {
      for (var i = 0; i < vals.length-1; i++) {
        ret +=
            '<p class="legend-row"><i style="background:' + colors[i] + '"></i> '
            + (i==0 ? vals[i+1] + postunits + ' or less' : ((i==vals.length-2)? ('more than ' + vals[i] + postunits) : (vals[i] + postunits + ' &ndash; ')))
            + ((i==vals.length-2)? '' : (i==0? '<br>' : vals[i + 1] + postunits + '<br>'))
            + '</p>';
      }
    }
  } else{
    for (var i = 0; i < vals.length; i++) {
      ret +=
          '<p class="legend-row"><i style="background:'
          + colors[i] + '"></i> '
          + vals[i] + postunits + (vals[i + 1] ? '<br>' : '')
          + '</p>';
    }
  }
  return ret;
}

function getBWLegHTML(vals, widths){
  let ret = '';
  for (var i = 0; i < vals.length-1; i++) {
    ret +=
        '<p class="legend-row"><i style="margin-top: 7px;background: #000;width: 30px;height:' + widths[i] + 'px"></i> '
        + (i==0 ? 'less than ' : ((i==vals.length-2)? (vals[i] + ' or more') : (vals[i] + ' &ndash; ')))
        + ((i==vals.length-2)? '' : (vals[i + 1] + '<br>'))
        + '</p>';
  }
  return ret;
}

function getQuantiles(x, n){
  let retval = [];
  for(var i = 1; i <= n; i++) {
    retval.push(x[Math.floor(x.length*1/i)-1]);
  }
  retval.push(x[0]);
  return retval;
}

let colorFunc = {
  'distance': getDistColor,
};

module.exports = {
  sfmap: sfmap,
  iconOrig: iconOrig,
  iconDest: iconDest,
  styles: styles,
  colorFunc: colorFunc,
  getColorByBin: getColorByBin,
  getColorFromVal: getColorFromVal,
  getColorFromVal2: getColorFromVal2,
  getLegHTML: getLegHTML,
  getLegHTML2: getLegHTML2,
  getBWLegHTML: getBWLegHTML,
  getQuantiles: getQuantiles,
  baseLayer: baseLayer,
};