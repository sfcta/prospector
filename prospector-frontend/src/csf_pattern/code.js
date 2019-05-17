'use strict';

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

// Must use npm and babel to support IE11/Safari
import 'isomorphic-fetch';
import Cookies from 'js-cookie';

// some important global variables.
// the data source
const API_SERVER = 'https://api.sfcta.org/api/';
const GEO_VIEW = 'csf_dist15';
const DATA_VIEW = 'connectsf_trippattern';
const COMMENT_SERVER = 'https://api.sfcta.org/commapi/';
const COMMENT_VIEW = 'csf_pattern_comment';
const VIZNAME = 'csf_pattern';
const YEAR_LIST = ['2015', '2050'];

// color schema

// delete internal trip outside sf area
const MUTE_DD = ['south_bay', 'east_bay', 'north_bay'];
const MUTE_OD = ['South Bay', 'East Bay', 'North Bay'];

// district order & color schema for each district
// const D_DISTRICT = ['downtown', 'soma', 'n_beach_and_chinatown', 'western_market',
//                   'mission_and_potrero', 'noe_and_glen_and_bernal',
//                   'marina_and_n_heights', 'richmond', 'bayshore', 'outer_mission',
//                   'hill_districts', 'sunset', 'south_bay', 'east_bay', 'north_bay'];
// const O_DISTRICT = ['Downtown', 'SoMa', 'N. Beach/Chinatown', 'Western Market',
//                     'Mission/Potrero', 'Noe/Glen/Bernal', 'Marina/N. Heights',
//                     'Richmond', 'Bayshore', 'Outer Mission', 'Hill Districts',
//                     'Sunset', 'South Bay', 'East Bay', 'North Bay'];
// const DISTRICT_COLORRAMP = [{district:'Downtown', color:'#cf1130'},
                            // {district:'SoMa',color: '#f47a8d'},
                            // {district:'N. Beach/Chinatown',color:'#f8a7b4'},
                            // {district:'Western Market',color:'#4B256D'},
                            // {district:'Mission/Potrero',color:'#6F5495'},
                            // {district:'Noe/Glen/Bernal',color:'#A09ED6'},
                            // {district:'Marina/N. Heights',color:"3F647E"},
                            // {district:'Richmond',color:'#688FAD'},
                            // {district:'Bayshore',color:'#7caac3'},
                            // {district:'Outer Mission',color:'#006466'},
                            // {district:'Hill Districts',color:'#2fa3a5'},
                            // {district:'Sunset',color:'#95D47A'},
                            // {district:'South Bay',color:'#677C8A'},
                            // {district:'East Bay',color:'#B2A296'},
                            // {district:'North Bay',color:'#a3a3a3'}];

const D_DISTRICT = ['marina_and_n_heights', 'n_beach_and_chinatown', 'downtown', 'western_market', 'east_bay',
                    'soma', 'mission_and_potrero', 'noe_and_glen_and_bernal', 'bayshore', 'south_bay',
                    'outer_mission', 'hill_districts', 'sunset', 'richmond', 'north_bay'];
const O_DISTRICT = ['Marina/N. Heights', 'N. Beach/Chinatown', 'Downtown', 'Western Market', 'East Bay',
                    'SoMa', 'Mission/Potrero', 'Noe/Glen/Bernal', 'Bayshore', 'South Bay',
                    'Outer Mission', 'Hill Districts', 'Sunset', 'Richmond', 'North Bay'];
// const DISTRICT_COLORRAMP = [{district:'Marina/N. Heights',color:"#D8BFD8"},
//                             {district:'N. Beach/Chinatown',color:'#6495ED'},
//                             {district:'Downtown', color:'#FF00FF'},
//                             {district:'SoMa',color: '#0000FF'},
//                             {district:'Western Market',color:'#F4A460'},
//                             {district:'Mission/Potrero',color:'#8E8E38'},
//                             {district:'Noe/Glen/Bernal',color:'#C6E2FF'},
//                             {district:'Bayshore',color:'#03A89E'},
//                             {district:'Outer Mission',color:'#66CDAA'},
//                             {district:'Hill Districts',color:'#00FF7F'},
//                             {district:'East Bay',color:'#912CEE'},
//                             {district:'South Bay',color:'#BF3EFF'},
//                             {district:'Sunset',color:'#800080'},
//                             {district:'Richmond',color:'#00EEEE'},
//                             {district:'North Bay',color:'#EE82EE'}];

const DISTRICT_POSITION = {'Marina/N. Heights':[5,-20],
                            'N. Beach/Chinatown':[-20,-15],
                            'Downtown':[0,0],
                            'SoMa':[105,-15],
                            'Western Market':[0,0],
                            'Mission/Potrero':[-5,0],
                            'Noe/Glen/Bernal':[-20,-2],
                            'Bayshore':[0,5],
                            'Outer Mission':[-5,-5],
                            'Hill Districts':[0,0],
                            'East Bay':[350,530],
                            'South Bay':[150,1050],
                            'Sunset':[-750,100],
                            'Richmond':[-45,0],
                            'North Bay':[120,-25]};

const DISTRICT_NAME = {'Marina/N. Heights':'Marina & <br> N.Heights',
                      'N. Beach/Chinatown':'N.Beach & <br> Chinatown',
                      'Downtown':'Downtown',
                      'SoMa':'SoMa',
                      'Western Market':'Western <br> Market',
                      'Mission/Potrero':'Mission & <br> Potrero',
                      'Noe/Glen/Bernal':'Noe & Glen <br> & Bernal',
                      'Bayshore':'Bayshore',
                      'Outer Mission':'Outer <br> Mission',
                      'Hill Districts':'Hill <br> Districts',
                      'East Bay':'East <br> Bay',
                      'South Bay':'South Bay',
                      'Sunset':'Sunset',
                      'Richmond':'Richmond',
                      'North Bay':'North Bay'};

//reference sfmap
var maplib = require('../jslib/maplib');
let styles = maplib.styles;

let mymap = maplib.sfmap;
// set map center and zoom level

mymap.setView([37.76889, -122.440997], 11);
mymap.zoomControl.remove();
mymap.scrollWheelZoom.disable();
// let baseLayer = maplib.baseLayer;
// mymap.removeLayer(baseLayer);

//create number formatting functions
var numberWithCommas = d3.format("0,f");

// main function
let _featJson;
async function initialPrep() {
  console.log('1...');
  await getMapData();

  console.log('2... ');
  await drawChord();

  console.log('3... ');
  _featJson = await fetchMapFeatures();

  console.log('4... ');
  await drawMapFeatures();

  console.log('5... ');
  await checkCookie();

  console.log('6 !!!');
  mymap.invalidateSize();
}

// get data from database
let _aggregateData;
async function getMapData() {
  let data_url = API_SERVER + DATA_VIEW;
  let resp = await fetch(data_url);
  let jsonData = await resp.json();

  let tmp = {};
  for (let yr of YEAR_LIST) {
    tmp[yr] = {};
    for (let imp of app.importance_options) {
      tmp[yr][imp.value] = {};
      for (let met of app.metric_options) {
        tmp[yr][imp.value][met.value] = {};
        for (let od of O_DISTRICT) {
          tmp[yr][imp.value][met.value][od] = {};
          for (let dd of D_DISTRICT) {
            tmp[yr][imp.value][met.value][od][dd] = 0;
          }
        }
      }
    }
  }

  for (let entry of jsonData) {
    for (let dd of D_DISTRICT) {
      tmp[entry.year][entry.group_purpose][entry.group_mode][entry.odistrict][dd] += entry[dd];
    }
  }

  _aggregateData = {};
  for (let yr of app.year_options) {
    _aggregateData[yr.value] = {};
    for (let imp of app.importance_options) {
      _aggregateData[yr.value][imp.value] = {};
      for (let met of app.metric_options) {
        _aggregateData[yr.value][imp.value][met.value] = [];
        for (let i=0; i< O_DISTRICT.length; i++) {
          _aggregateData[yr.value][imp.value][met.value].push([]);
        }
      }
    }
  }

  for (let yr of YEAR_LIST) {
    for (let imp of app.importance_options) {
      for (let met of app.metric_options) {
        for (let i=0; i<O_DISTRICT.length; i++) {
          let od = O_DISTRICT[i];
          for (let dd of D_DISTRICT) {
            if (MUTE_OD.includes(od) && MUTE_DD.includes(dd)) {
              _aggregateData[yr][imp.value][met.value][i].push(0);
            } else {
              _aggregateData[yr][imp.value][met.value][i].push(tmp[yr][imp.value][met.value][od][dd]);
            }
          }
        }
      }
    }
  }

  // calculate the change data
  for (let imp of app.importance_options) {
    for (let met of app.metric_options) {
      for (let i=0; i<O_DISTRICT.length; i++) {
        for (let j=0; j<D_DISTRICT.length; j++) {
          let diff_value = _aggregateData['2050'][imp.value][met.value][i][j]-_aggregateData['2015'][imp.value][met.value][i][j];
          _aggregateData['diff'][imp.value][met.value][i].push(diff_value);
        }
      }
    }
  }
}

var width = window.innerWidth,
    height = window.innerHeight - 10,
    outerRadius = Math.min(width, height) / 2 - 140,
    innerRadius = outerRadius - 10;

//create the arc path data generator for the groups
var arc = d3.svg.arc()
                .innerRadius(innerRadius)
                .outerRadius(outerRadius);

//create the chord path data generator for the chords
var path = d3.svg.chord().radius(innerRadius - 4);// subtracted 4 to separate the ribbon

/*** Initialize the visualization ***/
var svg = d3.select("#chart_placeholder")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

svg.append("rect")
  .attr("id", "overlay")
  .attr("width", width)
  .attr("height", height)
  .attr("fill-opacity", "0")
  .on("click", function() {
    console.log(1)
    if (chordHighlighted === true) {
      resetPopGeo();
    }
  });

var g = svg.append("g")
           .attr("id", "circle")
           .attr("transform", "translate(" + (width-500)/2 + "," + height/2 + ")");


g.append("circle").attr("r", outerRadius);

//define the default chord layout parameters
//within a function that returns a new layout object;
//that way, you can create multiple chord layouts
function getDefaultLayout() {
  return d3.layout.chord()
                  .padding(0.03)
                  .sortSubgroups(d3.descending)
                  .sortChords(d3.ascending);
}  
var last_layout; //store layout between updates

function chordKey(data) {
  return (data.source.index < data.target.index) ?
      data.source.index  + "-" + data.target.index:
      data.target.index  + "-" + data.source.index;
  
  //create a key that will represent the relationship
  //between these two groups *regardless*
  //of which group is called 'source' and which 'target'
}


function arcTween(oldLayout) {
    //this function will be called once per update cycle
    
    //Create a key:value version of the old layout's groups array
    //so we can easily find the matching group 
    //even if the group index values don't match the array index
    //(because of sorting)
    var oldGroups = {};
    if (oldLayout) {
        oldLayout.groups().forEach( function(groupData) {
          // console.log(groupData)
            oldGroups[ groupData.index ] = groupData;
        });
    }
    
    return function (d, i) {
        var tween;
        var old = oldGroups[d.index];
        if (old) { //there's a matching old group
            // console.log(old, d)
            tween = d3.interpolate(old, d);
        }
        else {
            //create a zero-width arc object
            var emptyArc = {startAngle:d.startAngle,
                            endAngle:d.startAngle};
            tween = d3.interpolate(emptyArc, d);
        }
        
        return function (t) {
            return arc( tween(t) );
        };
    };
}

function chordTween(oldLayout) {
    //this function will be called once per update cycle
    
    //Create a key:value version of the old layout's chords array
    //so we can easily find the matching chord 
    //(which may not have a matching index)
    
    var oldChords = {};
    
    if (oldLayout) {
        oldLayout.chords().forEach( function(chordData) {
            oldChords[ chordKey(chordData) ] = chordData;
        });
    }
    
    return function (d, i) {
        //this function will be called for each active chord
        
        var tween;
        var old = oldChords[ chordKey(d) ];
        if (old) {
            //old is not undefined, i.e.
            //there is a matching old chord value
            
            //check whether source and target have been switched:
            if (d.source.index != old.source.index ){
                //swap source and target to match the new data
                old = {
                    source: old.target,
                    target: old.source
                };
            }
            
            tween = d3.interpolate(old, d);
        }
        else {
            //create a zero-width chord object           
            if (oldLayout) {
                var oldGroups = oldLayout.groups().filter(function(group) {
                        return ( (group.index == d.source.index) ||
                                (group.index == d.target.index) )
                    });
                old = {source:oldGroups[0],
                          target:oldGroups[1] || oldGroups[0] };
                    //the OR in target is in case source and target are equal
                    //in the data, in which case only one group will pass the
                    //filter function
                
                if (d.source.index != old.source.index ){
                    //swap source and target to match the new data
                    old = {
                        source: old.target,
                        target: old.source
                    };
                }
            }
            else old = d;

            var emptyChord = {
                source: { startAngle: old.source.startAngle,
                        endAngle: old.source.startAngle},
                target: { startAngle: old.target.startAngle,
                        endAngle: old.target.startAngle}
            };
            tween = d3.interpolate( emptyChord, d );
        }

        return function (t) {
            //this function calculates the intermediary shapes
            return path(tween(t));
        };
    };
}

let highlight = -1;
let chordHighlighted;
let matrix;
async function drawChord() {
  matrix = _aggregateData[app.selected_year][app.selected_importance][app.selected_metric];

  var layout = getDefaultLayout(); //create a new layout object
  layout.matrix(matrix);

  /* Create/update "group" elements */
  var groupG = g.selectAll("g.group")
                .data(layout.groups(), function (d) {
                    return d.index; 
                    //use a key function in case the 
                    //groups are sorted differently 
                });

  groupG.exit()
        .transition()
        // .duration(1500)
        .attr("opacity", 0)
        .remove(); //remove after transitions are complete
  
  var newGroups = groupG.enter()
                        .append("g")
                        .attr("class", "group");

  //create the arc paths and set the constant attributes
  //(those based on the group index, not on the value)
  newGroups.append("path")
           .attr("id", function (d) {
             return "group" + d.index;
             //using d.index and not i to maintain consistency
             //even if groups are sorted
           })
           .style("fill", "#EC7074");
  
  //update the paths to match the layout
  groupG.select("path") 
        .transition()
        .duration(300)
        .attrTween("d", arcTween( last_layout ));
  
  //create the labels
  newGroups.append("svg:text")
          .attr("xlink:href", function (d) {
            return "#group" + d.index;
          });

  newGroups.select("text")
          .append("tspan")
          .attr("class", "name")
          .attr("x",0)
          .attr("dy",0)
          .text(function (d) {
            return O_DISTRICT[d.index]; 
          });
  newGroups.select("text")
          .append("tspan")
          .attr("class", "number")
          .attr("x",0)
          .attr("dy","18px")
          .text(function (d) {
            return numberWithCommas(d.value);
        });
  
  if (highlight !== -1) {
    groupG.select("tspan.number")
          .text(function (d) {
            if (highlight == d.index) {
              return numberWithCommas(d.value);
            } else {
              return numberWithCommas(matrix[highlight][d.index]);
            }
          });
  } else {
    groupG.select("tspan.number")
          .text(function (d) {
            return numberWithCommas(d.value);
          });
  }

  //position group labels to match layout
  groupG.select("text")
        .transition()
        .duration(1000)
        .attr("transform", function(d) {
            d.angle = (d.startAngle + d.endAngle) / 2;
            //store the midpoint angle in the data object
            return "rotate(" + (d.angle * 180 / Math.PI - 90) + ")" +
                  " translate(" + (innerRadius + 26) + ")" + 
                  (d.angle > Math.PI ? " rotate(180)" : " rotate(0)"); 
            //include the rotate zero so that transforms can be interpolated
        })
        .attr("text-anchor", function (d) {
            return d.angle > Math.PI ? "end" : "begin";
        });
  
  /* Create/update the chord paths */
  var chordPaths = g.selectAll("path.chord")
                    .data(layout.chords(), chordKey);

  //create the new chord paths
  var newChords = chordPaths.enter()
                            .append("path")
                            .attr("class", "chord");

  // Add title tooltip for each new chord.
  newChords.append("title");
  // Update all chord title texts
  chordPaths.select("title")
            .text(function(d) {
                if (O_DISTRICT[d.target.index] !== O_DISTRICT[d.source.index]) {
                    return [numberWithCommas(d.source.value),
                            " trips from ",
                            O_DISTRICT[d.source.index],
                            " to ",
                            O_DISTRICT[d.target.index],
                            "\n",
                            numberWithCommas(d.target.value),
                            " trips from ",
                            O_DISTRICT[d.target.index],
                            " to ",
                            O_DISTRICT[d.source.index]
                            ].join(""); 
                        //joining an array of many strings is faster than
                        //repeated calls to the '+' operator, 
                        //and makes for neater code!
                } 
                else { //source and target are the same
                    return numberWithCommas(d.source.value) 
                        + " trips ended in " 
                        + O_DISTRICT[d.source.index];
                }
            });

  //handle exiting paths:
  chordPaths.exit()
            .transition()
            .attr("opacity", 0)
            .remove();

  //update the path shape
  if (highlight !== -1) {
    chordPaths.transition()
              // .duration(300)
              .style("opacity", 1) //optional, just to observe the transition
              .style("fill", "#EC7074")
              .attrTween("d", chordTween(last_layout))
              .filter(function(d) {
                return d.source.index != highlight && d.target.index != highlight;
              })
              .style("opacity", .1);
  } else {
    chordPaths.transition()
              .duration(300)
              .style("opacity", 1) //optional, just to observe the transition
              .style("fill", "#EC7074")
              .attrTween("d", chordTween(last_layout));
  }

  //add the mouseover/fade out behaviour to the groups
  //this is reset on every update, so it will use the latest
  //chordPaths selection
  groupG.on("click", function(d){
    if (highlight == d.index) {
      resetPopGeo();
    }  
    else {
      if (highlight != -1) {
        resetPopGeo();
      }
      fade(.1, d.index);
      geoLayer.eachLayer(function(layer) {
        if(layer._polygonId === d.index) {
          setHighlighted(layer);
          selectedGeo = layer;
        }
      });

      chordHighlighted = true;
    }

    highlight = chordHighlighted ? d.index : -1;
  });

  chordPaths.on("mouseover", pathfade(.1))
            .on("mouseout", function(d){
              pathfade(1);
              if (selectedGeo) {
                fade(.1, O_DISTRICT.indexOf(selectedGeo.feature.dist15name));
              }
              if (highlight != -1) {
                fade(.1, highlight);
              }
            });

  last_layout = layout; //save for next update
}

function fade(opacity, p) {
  if (opacity == 1) {
    g.selectAll("tspan.number")
      .text(function (d) {
        return numberWithCommas(d.value);
      })
      .transition();
  } else {
    g.selectAll("tspan.number")
      .text(function (d) {
        if (p == d.index) {
          return numberWithCommas(d.value);
        } else {
          return numberWithCommas(matrix[p][d.index]);
        }
      })
      .transition();
  }
  return g.selectAll("path.chord")
          .filter(function(d) {
            return d.source.index != p && d.target.index != p;
          })
          .transition()
          .style("opacity", opacity)
          .filter(function(d) {             
            return d.source.index == p || d.target.index == p;
          })
          .transition()
          .style("opacity", 1);
}

function pathfade(opacity) {
  if (opacity !== 1) {
    return function() {
      var me = this;
      g.selectAll("path.chord")
        .filter(function(d) {                   
          return this != me;
        })
        .transition()
        .style("opacity", opacity);
    };
  } else {
    return g.selectAll("path.chord")
    .transition()
    .style("opacity", opacity);
  }
}

// referenece map
// get the district boundary data
async function fetchMapFeatures() {
  const geo_url = API_SERVER + GEO_VIEW;

  try {
    let resp = await fetch(geo_url);
    let features = await resp.json();

    // do some parsing and stuff
    for (let feat of features) {
      feat['type'] = 'Feature';
      feat['geometry'] = JSON.parse(feat.geometry);
      feat['position'] = DISTRICT_POSITION[feat.dist15name];
      feat['distname'] = DISTRICT_NAME[feat.dist15name]
    }

    return features;
  } catch (error) {
    console.log('map feature error: ' + error);
  }
}

let cleanFeatures;
let geoLayer;
async function drawMapFeatures() {
  if (!_featJson) return;
  cleanFeatures = _featJson.slice();
  
  geoLayer = L.geoJSON(cleanFeatures, {
    style: {opacity: 1, weight: 2, color:'#b3b3b3', fillColor:'#e6e6e6', fillOpacity: 0.6},
    onEachFeature: function(feature, layer) {
      layer.on({
        mouseover: hoverFeature,
        click: clickedOnFeature,
        });
      layer._polygonId = O_DISTRICT.indexOf(feature.dist15name);
      layer.bindTooltip(feature.distname, {
        permanent: true,
        offset: feature.position,
        direction: "center",
        className: "district-name"
      });
    },
  });
  geoLayer.addTo(mymap);
}

// hover panel -------------------
let infoPanel = L.control();

infoPanel.onAdd = function(map) {
  // create a div with a class "info"
  this._div = L.DomUtil.create('div', 'info-panel-hide');
  return this._div;
};

// hover infomation format
function getInfoHtml(geo) {
  let retval = `${geo.dist15name}`;
  return retval; 
}

// activate function
infoPanel.update = function(geo) {
  infoPanel._div.innerHTML = '';
  infoPanel._div.className = 'info-panel';
  if (geo) this._div.innerHTML = getInfoHtml(geo);
  infoPanelTimeout = setTimeout(function() {
    // use CSS to hide the info-panel
    infoPanel._div.className = 'info-panel-hide';
    // and clear the hover too
    if (selectedGeo) {
      if (oldHoverTarget.feature.dist15name != selectedGeo.feature.dist15name) geoLayer.resetStyle(oldHoverTarget);
    } else {
      fade(1, O_DISTRICT.indexOf(oldHoverTarget.feature.dist15name));
      geoLayer.resetStyle(oldHoverTarget);
    }
  }, 2000);
};
infoPanel.addTo(mymap);

function setHighlighted(highlightedGeo) {
  highlightedGeo.bringToFront();
  highlightedGeo.setStyle({opacity: 0.5, weight: 2, color:'#b3b3b3', fillColor:'#C57879', fillOpacity: 0.6});
}

// hover mouseover
let infoPanelTimeout;
let oldHoverTarget;
function hoverFeature(e) {
  clearTimeout(infoPanelTimeout);
  infoPanel.update(e.target.feature);
  
  // don't do anything else if the feature is already clicked
  if (selectedGeo) {
    if (selectedGeo.feature.dist15name === e.target.feature.dist15name) return;
    else {
      // return previously-hovered segment to its original color
      if (oldHoverTarget && e.target.feature.dist15name != selectedGeo.feature.dist15name) {
        if (oldHoverTarget.feature.dist15name != selectedGeo.feature.dist15name)
          geoLayer.resetStyle(oldHoverTarget);
      }
      let highlightedGeo = e.target;
      setHighlighted(highlightedGeo);
      oldHoverTarget = e.target;
      return;
    }
  } else {
    if (oldHoverTarget) {
        geoLayer.resetStyle(oldHoverTarget);
        fade(1, O_DISTRICT.indexOf(oldHoverTarget.feature.dist15name));
    }

    let highlightedGeo = e.target;
    setHighlighted(highlightedGeo);
    fade(.1, O_DISTRICT.indexOf(highlightedGeo.feature.dist15name));
    oldHoverTarget = e.target;
  }
}

// hover clickon
let selectedGeo;
async function clickedOnFeature(e) {
  e.target.setStyle({opacity: 0.5, weight: 2, color:'#b3b3b3', fillColor:'#C57879', fillOpacity: 0.6});

  // unselect the previously-selected selection, if there is one
  if (selectedGeo && selectedGeo.feature.dist15name != e.target.feature.dist15name) {
    geoLayer.resetStyle(selectedGeo);
    selectedGeo = e.target;

    // update chord
    fade(1, highlight);
    fade(.1, O_DISTRICT.indexOf(selectedGeo.feature.dist15name));
    highlight = O_DISTRICT.indexOf(selectedGeo.feature.dist15name);
  }
  else if (selectedGeo && selectedGeo.feature.dist15name == e.target.feature.dist15name) {
    resetPopGeo();
  }
  else {
    selectedGeo = e.target;

    fade(.1, O_DISTRICT.indexOf(selectedGeo.feature.dist15name));
    highlight = O_DISTRICT.indexOf(selectedGeo.feature.dist15name);
    chordHighlighted = true;
  }
}

function resetPopGeo() {
  geoLayer.resetStyle(selectedGeo);
  fade(1, O_DISTRICT.indexOf(selectedGeo.feature.dist15name));
  selectedGeo = null;
  highlight = -1;
  chordHighlighted = false;
}

// keep highlight when change selections
// function highlightSelectedSegment() {
//   if (!selGeoId) return;

//   mymap.eachLayer(function (e) {
//     try {
//       if (e.feature.taz === selGeoId) {
//         e.bringToFront();
//         e.setStyle(styles.popup);
//         selectedGeo = e;
//         return;
//       }
//     } catch(error) {}
//   });
// }

// functions for vue
async function selectionChanged() {
  await drawChord();
  // highlightSelectedSegment();
}

function yrChanged(yr) {
  app.selected_year = yr;
}

function metricChanged(metric) {
  app.selected_metric = metric;
}

function importanceChanged(importance) {
  app.selected_importance = importance;
}

function setCookie(cname, exdays) {
  var d = new Date();
  d.setTime(d.getTime() + (exdays*24*60*60*1000));
  var expires = "expires="+ d.toUTCString();
  document.cookie = cname + "=" + d.getTime() + ";" + expires + ";path=/";
}

function getCookie(cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(';');
  for(var i = 0; i <ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function checkCookie() {
  var username = getCookie("username");
  if (username == "") {
    setCookie("username", 365);
  }
}

let comment = {
  vizname: VIZNAME,
  select_year: '',
  select_purpose: '',
  select_mode: '',
  add_layer: '',
  comment_user: '',
  comment_time: new Date(),
  comment_latitude: -999,
  comment_longitude: -999,
  comment_content: ''
};

function showPosition(position) {
  comment.comment_latitude = position.coords.latitude;
  comment.comment_longitude = position.coords.longitude; 
}

function handleSubmit() {
  this.$refs.recaptcha.execute();
  let timestamp = new Date();
  app.submit_loading = true;
  
  setTimeout(function() {
    if (app.comment==null | app.comment=='') {
      app.submit_loading = false;
    } else {
      comment.select_year = app.selected_year;
      comment.select_purpose = app.selected_importance;
      comment.select_mode = app.selected_metric;
      comment.add_layer = app.addLayers;
      comment.comment_user = getCookie("username");
      comment.comment_time = timestamp;
      comment.comment_content = app.comment;
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(showPosition);
      } else {
        console.log("Geolocation is not supported by this browser.");
      }
      //console.log(JSON.stringify(comment));
      postComments(comment);
      app.comment_instruction = 'Thank you for your feedback!';
      app.comment = '';
      app.submit_loading = false;
      // app.submit_disabled = true;
    }
  }, 1000)
}

async function postComments(comment) {
  const comment_url = COMMENT_SERVER + COMMENT_VIEW;
  // console.log(JSON.stringify(comment))
  try {
    await fetch(comment_url, {
      method: 'POST',
      body: JSON.stringify(comment),
      headers:{
        'Content-Type': 'application/json',
      }
    });
  } catch (error) {
    console.log('comment error: ' + error);
  }
}

function onCaptchaVerified(recaptchaToken) {
  const self = this;
  self.$refs.recaptcha.reset();
  if (!recaptchaToken) {
    return console.log("recaptchaToken is required");
  }

  const verifyCaptchaOptions = {
    secret: "6Le7GqIUAAAAAOmfXozDNDNWQwJE_0dIleut8q16",
    response: recaptchaToken
  };

  fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: 'POST',
    mode: 'no-cors',
    body: JSON.stringify(verifyCaptchaOptions),
    headers:{
      'Content-Type': 'application/json',
    }
  })
  .catch(error => console.error('Error:', error))
  .then(response => function (response) {
    // JSON.stringify(response)
    console.log("Congratulations! We think you are human.");
  });
}

function onCaptchaExpired() {
  this.$refs.recaptcha.reset();
}

let app = new Vue({
  el: '#picker',
  delimiters: ['${', '}'],
  components: {
    'vue-recaptcha': VueRecaptcha
  },  
  data: {
    // isPanelHidden: false,

    // year
    year_options: [
      {text: '2015', value: '2015'},
      {text: '2050', value: '2050'},
      {text: 'Change', value: 'diff'},
      ],
    selected_year: '2015',
    
    // purpose type
    selected_importance: 'total',
    importance_options: [
    {text: 'All', value: 'total'},
    {text: 'Work / School', value: 'mandatory'},
    {text: 'Other', value: 'discretionary'},
    ],
    
    // transit type
    selected_metric: 'total',
    metric_options: [
    {text: 'All', value: 'total'},
    {text: 'Walk/Bike', value: 'walk/bike'},
    {text: 'Transit', value: 'transit'},
    {text: 'Uber/Lyft', value: 'uber/lyft'},
    {text: 'Auto', value: 'drive'},
    ],

    // comment box
    comment: '',
    comment_instruction: 'Based on this data, what do you think are the city’s transportation needs? (800 characters)',
    submit_loading: false,
    submit_disabled: false,
  },
  watch: {
    selected_year:selectionChanged,
    selected_metric: selectionChanged,    // mode choose
    selected_importance: selectionChanged,
  },
  methods: {
    yrChanged: yrChanged,               // year change
    metricChanged: metricChanged,       // mode change
    importanceChanged: importanceChanged,
    handleSubmit: handleSubmit,
    clickToggleHelp: clickToggleHelp,   // help box
    onCaptchaVerified: onCaptchaVerified,
    onCaptchaExpired: onCaptchaExpired,    
  },
});

// eat some cookies -- so we can hide the help permanently
let cookieShowHelp = Cookies.get('showHelp');
function clickToggleHelp() {
  helpPanel.showHelp = !helpPanel.showHelp;

  // and save it for next time
  if (helpPanel.showHelp) {
    Cookies.remove('showHelp');
  } else {
    Cookies.set('showHelp', 'false', { expires: 365 });
  }
}

let helpPanel = new Vue({
  el: '#helpbox',
  data: {
    showHelp: cookieShowHelp == undefined,
  },
  methods: {
    clickToggleHelp: clickToggleHelp,
  },
  mounted: function() {
    document.addEventListener('keydown', e => {
      if (this.showHelp && e.keyCode == 27) {
        clickToggleHelp();
      }
    });
  },
});

initialPrep();

// test
