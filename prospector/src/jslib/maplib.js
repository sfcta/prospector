
let theme = "light";
let sfmap = L.map('sfmap').setView([37.77, -122.42], 12);
let url = 'https://api.mapbox.com/styles/v1/mapbox/'+theme+'-v9/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
let token = 'pk.eyJ1IjoicHNyYyIsImEiOiJjaXFmc2UxanMwM3F6ZnJtMWp3MjBvZHNrIn0._Dmske9er0ounTbBmdRrRQ';
let attribution ='<a href="http://openstreetmap.org">OpenStreetMap</a> | ' +
                 '<a href="http://mapbox.com">Mapbox</a>';
L.tileLayer(url, {
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

function getLegHTML(vals, colors, bins=true){
  let ret = '';
  if(bins){
    // loop through our bin intervals and generate a label with a colored square for each interval
    for (var i = 0; i < vals.length; i++) {
      ret +=
          '<i style="background:' + colors[i+1] + '"></i> ' +
          vals[i] + (vals[i + 1] ? ' &ndash; ' + vals[i + 1] + '<br>' : '+');
    }
  } else{
    for (var i = 0; i < vals.length; i++) {
      ret +=
          '<i style="background:' + colors[i] + '"></i> ' +
          vals[i] + (vals[i + 1] ? '<br>' : '');
    }
  }
  return ret;
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
  getLegHTML: getLegHTML,
};