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
import d3 from 'd3';

// some important global variables.
// the data source
const API_SERVER = 'https://api.sfcta.org/api/';
const DATA_VIEW = 'connectsf_trippattern';
const COMMENT_VIEW = 'connectsf_comment';

// sidebar select lists
// const YR_LIST = ['2015','2050'];

// color schema
const INT_COLS = []; //
const DISCRETE_VAR_LIMIT = 10; //
const MISSING_COLOR = '#ccd'; //
const COLORRAMP = {//SEQ: ['#ccd', '#eaebe1','#D2DAC3','#7eb2b5','#548594', '#003f5a', '#001f2d'],
                   SEQ: ['#daf2ef','#bedceb','#9abae2','#709bd9', '#5885d1', '#585b94', '#544270'],
                   DIV: ['#d7191c','#fdae61','#ffffbf','#a6d96a','#1a9641']};

const D_DISTRICT = ['downtown', 'soma', 'n_beach_and_chinatown', 'western_market',
                  'mission_and_potrero', 'noe_and_glen_and_bernal',
                  'marina_and_n_heights', 'richmond', 'bayshore', 'outer_mission',
                  'hill_districts', 'sunset', 'south_bay', 'east_bay', 'north_bay'];
const O_DISTRICT = ['Downtown', 'SoMa', 'N. Beach/Chinatown', 'Western Market',
                    'Mission/Potrero', 'Noe/Glen/Bernal', 'Marina/N. Heights',
                    'Richmond', 'Bayshore', 'Outer Mission', 'Hill Districts',
                    'Sunset', 'South Bay', 'East Bay', 'North Bay'];

//create number formatting functions
var formatPercent = d3.format("%");
var numberWithCommas = d3.format("0,f");

// main function
let _featJson;
async function initialPrep() {
  console.log('1...');
  await getMapData();

  console.log('2... ');
  await drawMapFeatures();

  console.log('3... ');
  
  console.log('4... ');

  console.log('5... ');
  await checkCookie();

  console.log('6 !!!');
}

// get data from database
// let base_lookup;
let _aggregateData;
async function getMapData() {
  let data_url = API_SERVER + DATA_VIEW;
  let resp = await fetch(data_url);
  let jsonData = await resp.json();

  // base_lookup = {};
  let tmp = {};
  for (let yr of app.year_options) {
    tmp[yr.value] = {};
    for (let imp of app.importance_options) {
      tmp[yr.value][imp.value] = {};
      for (let met of app.metric_options) {
        tmp[yr.value][imp.value][met.value] = {};
        for (let od of O_DISTRICT) {
          tmp[yr.value][imp.value][met.value][od] = {};
          for (let dd of D_DISTRICT) {
            tmp[yr.value][imp.value][met.value][od][dd] = 0;
          }
        }
      }
    }
  }

  console.log(tmp)
  for (let entry of jsonData) {
    for (let dd of D_DISTRICT) {
      tmp[entry.year][entry.group_purpose][entry.mode][entry.odistrict][dd] += entry[dd];
    }
  }

  console.log(tmp)
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
  console.log(_aggregateData)

  for (let yr of app.year_options) {
    for (let imp of app.importance_options) {
      // let row = {};
      // row['year'] = yr.toString();
      for (let met of app.metric_options) {
        for (let i=0; i< O_DISTRICT.length; i++) {
          let od = O_DISTRICT[i];
          let row = [];
          for (let dd of D_DISTRICT) {
            row.push(tmp[yr.value][imp.value][met.value][od][dd]);
          }
          _aggregateData[yr.value][imp.value][met.value][i].push(row);
        }
      }
    }
  }
  console.log(_aggregateData)
}


// // hover panel -------------------
// let infoPanel = L.control();

// infoPanel.onAdd = function(map) {
//   // create a div with a class "info"
//   this._div = L.DomUtil.create('div', 'info-panel-hide');
//   return this._div;
// };

// // hover infomation format
// function getInfoHtml(geo) {
//   let retval = '<b>TAZ: </b>' + `${geo.taz}<br/>` +
//                 '<b>NEIGHBORHOOD: </b>' + `${geo.nhood}<br/><hr>`;

//   let metcol1 = app.selected_metric + YR_LIST[0];
//   let metcol2 = app.selected_metric + YR_LIST[1];
  
//   let metric1 = geo[metcol1].toLocaleString();
//   let metric2 = geo[metcol2].toLocaleString();
//   let diff = (geo[metcol2] - geo[metcol1]).toLocaleString();

//   retval += `<b>${YR_LIST[0]}</b> `+`<b>${METRIC_DESC[app.selected_metric]}: </b>` + `${metric1}<br/>` +
//             `<b>${YR_LIST[1]}</b> `+`<b>${METRIC_DESC[app.selected_metric]}: </b>` + `${metric2}<br/>`+
//             `<b>${METRIC_DESC[app.selected_metric]}</b>` + '<b> Change: </b>' + `${diff}`;
//   return retval; 
// }

// // activate function
// let geoLayer;
// infoPanel.update = function(geo) {
//   infoPanel._div.innerHTML = '';
//   infoPanel._div.className = 'info-panel';
//   if (geo) this._div.innerHTML = getInfoHtml(geo);
//   infoPanelTimeout = setTimeout(function() {
//     // use CSS to hide the info-panel
//     infoPanel._div.className = 'info-panel-hide';
//     // and clear the hover too
//     if (oldHoverTarget.feature.taz != selGeoId) geoLayer.resetStyle(oldHoverTarget);
//   }, 2000);
// };
// infoPanel.addTo(mymap);

// // main map ------------------


// let map_vals;
// let prec;
// let sel_colorvals, sel_colors, sel_binsflag;
// let mapLegend;
var width = 760,
    height = 820,
    outerRadius = Math.min(width, height) / 2 - 120,//100,
    innerRadius = outerRadius - 10;

//create the arc path data generator for the groups
var arc = d3.svg.arc()
  .innerRadius(innerRadius)
  .outerRadius(outerRadius);

//create the chord path data generator for the chords
var path = d3.svg.chord()
  .radius(innerRadius - 4);// subtracted 4 to separate the ribbon

/*** Initialize the visualization ***/
var g = d3.select("#chart_placeholder")
          .append("svg")
          .attr("width", width)
          .attr("height", height)
          .append("g")
          .attr("id", "circle")
          .attr("transform", 
                "translate(" + width / 2 + "," + height / 2 + ")");

//the entire graphic will be drawn within this <g> element,
//so all coordinates will be relative to the center of the circle

g.append("circle").attr("r", outerRadius);
//this circle is set in CSS to be transparent but to respond to mouse events
//It will ensure that the <g> responds to all mouse events within
//the area, even after chords are faded out.

async function drawMapFeatures() {

  // var dataset = "foursix.json";
  var dataset = _aggregateData[app.selected_year][app.selected_importance][app.selected_metric];
  // //string url for the initial data set
  // //would usually be a file path url, here it is the id
  // //selector for the <pre> element storing the data

  /*** Read in the neighbourhoods data and update with initial data matrix ***/
  //normally this would be done with file-reading functions
  //d3. and d3.json and callbacks, 
  //instead we're using the string-parsing functions
  //d3.csv.parse and JSON.parse, both of which return the data,
  //no callbacks required.

  // d3.csv("regionsfish.csv", function(error, regionData) {
  //   if (error) {
  //     alert("Error reading file: ", error.statusText);
  //     return;
  //   }
    
  //   regions = regionData; 
  //   //store in variable accessible by other functions    

  //   //regions = d3.csv.parse(d3.select("#regions").text());
  //   //instead of d3.csv

  //   updateChords(dataset); 
  //   //call the update method with the default dataset
  // }); //end of d3.csv function
  
  //define the default chord layout parameters
  //within a function that returns a new layout object;
  //that way, you can create multiple chord layouts
  //that are the same except for the data.
  function getDefaultLayout() {
    return d3.layout.chord()
    .padding(0.03)
    .sortSubgroups(d3.descending)
    .sortChords(d3.ascending);
  }  
  var last_layout; //store layout between updates
  var regions; //store neighbourhood data outside data-reading function

  //var matrix = JSON.parse( d3.select(datasetURL).text() );
      // instead of d3.json
  
  /* Compute chord layout. */
  var layout = getDefaultLayout(); //create a new layout object
  layout.matrix(dataset);

  /* Create/update "group" elements */
  var groupG = g.selectAll("g.group")
      .data(layout.groups())
      // , function (d) {
      //     return d.index; 
      //     //use a key function in case the 
      //     //groups are sorted differently 
      // });
  
  groupG.exit()
        .transition()
        .duration(1500)
        .attr("opacity", 0)
        .remove(); //remove after transitions are complete
  
  var newGroups = groupG.enter()
                        .append("g")
                        .attr("class", "group");
  //the enter selection is stored in a variable so we can
  //enter the <path>, <text>, and <title> elements as well

  
  //Create the title tooltip for the new groups
  newGroups.append("title");
  
  //Update the (tooltip) title text based on the data
  // groupG.select("title")
  //     .text(function(d, i) {
  //         return numberWithCommas(d.value) 
  //             + " x (10\u00B3) in USD exports from " 
  //             + regions[i].name;
  //     });

  //create the arc paths and set the constant attributes
  //(those based on the group index, not on the value)
  newGroups.append("path")
      .attr("id", function (d) {
          return "group" + d.index;
          //using d.index and not i to maintain consistency
          //even if groups are sorted
      });
      // .style("fill", function (d) {
      //     return regions[d.index].color;
      // });
  
  //update the paths to match the layout
  groupG.select("path") 
      .transition()
          .duration(1500)
          //.attr("opacity", 0.5) //optional, just to observe the transition////////////
      .attrTween("d", arcTween( last_layout ))
        // .transition().duration(100).attr("opacity", 1) //reset opacity//////////////
      ;
  
  //create the group labels
  newGroups.append("svg:text")
      .attr("xlink:href", function (d) {
          return "#group" + d.index;
      })
      .attr("dy", ".35em")
      .attr("color", "#fff")
      // .text(function (d) {
      //     return regions[d.index].name; 
      // });

  //position group labels to match layout
  groupG.select("text")
      .transition()
          .duration(1500)
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
      .data(layout.chords(), chordKey );
          //specify a key function to match chords
          //between updates
      
  
  //create the new chord paths
  var newChords = chordPaths.enter()
      .append("path")
      .attr("class", "chord");
  
  // Add title tooltip for each new chord.
  newChords.append("title");
  
  // Update all chord title texts
  chordPaths.select("title")
      // .text(function(d) {
      //     if (regions[d.target.index].name !== regions[d.source.index].name) {
      //         return [numberWithCommas(d.source.value),
      //                 " exports from ",
      //                 regions[d.source.index].name,
      //                 " to ",
      //                 regions[d.target.index].name,
      //                 "\n",
      //                 numberWithCommas(d.target.value),
      //                 " exports from ",
      //                 regions[d.target.index].name,
      //                 " to ",
      //                 regions[d.source.index].name
      //                 ].join(""); 
      //             //joining an array of many strings is faster than
      //             //repeated calls to the '+' operator, 
      //             //and makes for neater code!
      //     } 
      //     else { //source and target are the same
      //         return numberWithCommas(d.source.value) 
      //             + " exports ended in " 
      //             + regions[d.source.index].name;
      //     }
      // });

  //handle exiting paths:
  chordPaths.exit().transition()
      .duration(1500)
      .attr("opacity", 0)
      .remove();

  //update the path shape
  chordPaths.transition()
      .duration(1500)
      //.attr("opacity", 0.5) //optional, just to observe the transition
      // .style("fill", function (d) {
      //     return regions[d.source.index].color;
      // })
      // .attrTween("d", chordTween(last_layout))
      //.transition().duration(100).attr("opacity", 1) //reset opacity
  ;

  //add the mouseover/fade out behaviour to the groups
  //this is reset on every update, so it will use the latest
  //chordPaths selection
  groupG.on("mouseover", function(d) {
      chordPaths.classed("fade", function (p) {
          //returns true if *neither* the source or target of the chord
          //matches the group that has been moused-over
          return ((p.source.index != d.index) && (p.target.index != d.index));
      });
  });
  //the "unfade" is handled with CSS :hover class on g#circle
  //you could also do it using a mouseout event:
  /*
  g.on("mouseout", function() {
      if (this == g.node() )
          //only respond to mouseout of the entire circle
          //not mouseout events for sub-components
          chordPaths.classed("fade", false);
  });
  */
  
  last_layout = layout; //save for next update


  /* Create OR update a chord layout from a data matrix */
  
  function arcTween(oldLayout) {
      //this function will be called once per update cycle
      
      //Create a key:value version of the old layout's groups array
      //so we can easily find the matching group 
      //even if the group index values don't match the array index
      //(because of sorting)
      var oldGroups = {};
      if (oldLayout) {
          oldLayout.groups().forEach( function(groupData) {
              oldGroups[ groupData.index ] = groupData;
          });
      }
      
      return function (d, i) {
          var tween;
          var old = oldGroups[d.index];
          if (old) { //there's a matching old group
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

  function chordKey(data) {
      return (data.source.index < data.target.index) ?
          data.source.index  + "-" + data.target.index:
          data.target.index  + "-" + data.source.index;
      
      //create a key that will represent the relationship
      //between these two groups *regardless*
      //of which group is called 'source' and which 'target'
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
  ///////////////////////////////////////////////////////////in the copy ////////////////            
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
  /////////////////////////////////////////////////////////////////               
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
  /*
  function disableButton(buttonNode) {
      d3.selectAll("button")
          .attr("disabled", function(d) {
              return this === buttonNode? "true": null;
          });
  }
  */
}

// // map color style
// function styleByMetricColor(feat) {
//   let color = getColorFromVal(
//               feat['metric'],
//               sel_colorvals,
//               sel_colors,
//               sel_binsflag
//               );

//   if (!color) color = MISSING_COLOR;

//   return { fillColor: color, opacity: 1, weight: 1, color: color, fillOpacity: 1};
// }

// // hover mouseover
// let infoPanelTimeout;
// let oldHoverTarget;
// function hoverFeature(e) {
//   clearTimeout(infoPanelTimeout);
//   infoPanel.update(e.target.feature);
  
//   // don't do anything else if the feature is already clicked
//   if (selGeoId === e.target.feature.taz) return;

//   // return previously-hovered segment to its original color
//   if (oldHoverTarget && e.target.feature.taz != selGeoId) {
//     if (oldHoverTarget.feature.taz != selGeoId)
//       geoLayer.resetStyle(oldHoverTarget);
//   }

//   let highlightedGeo = e.target;
//   highlightedGeo.bringToFront();
//   highlightedGeo.setStyle(styles.selected);
//   oldHoverTarget = e.target; 
// }

// // hover clickon
// let selGeoId;
// let selectedGeo;
// let prevSelectedGeo;
// let selectedLatLng;
// function clickedOnFeature(e) {
//   e.target.setStyle(styles.popup);
//   let geo = e.target.feature;
//   selGeoId = geo.taz;

//   // unselect the previously-selected selection, if there is one
//   if (selectedGeo && selectedGeo.feature.taz != geo.taz) {
//     prevSelectedGeo = selectedGeo;
//     geoLayer.resetStyle(prevSelectedGeo);
//   }
//   selectedGeo = e.target;
//   let selfeat = selectedGeo.feature;
//   app.chartSubtitle = 'TAZ ' + selfeat.taz + ' in ' + selfeat.nhood;
//   selectedLatLng = e.latlng;
//   if (base_lookup.hasOwnProperty(selGeoId)) {
//     showGeoDetails(selectedLatLng);
//     // buildChartHtmlFromData(selGeoId);
//   } else {
//     resetPopGeo();
//   }
// }

// let popSelGeo;
// let chart_deftitle = 'All TAZs Combined';
// function showGeoDetails(latlng) {
//   // show popup
//   popSelGeo = L.popup()
//     .setLatLng(latlng)
//     .setContent(infoPanel._div.innerHTML)
//     .addTo(mymap);

//   // Revert to overall chart when no segment selected
//   popSelGeo.on('remove', function(e) {
//     resetPopGeo();
//   });
// }

// function resetPopGeo() {
//   geoLayer.resetStyle(selectedGeo);
//   prevSelectedGeo = selectedGeo = selGeoId = null;
//   app.chartSubtitle = chart_deftitle;
//   // buildChartHtmlFromData();
// }

// // ????
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

// chart ---------------------------
// let distChart = null;
// let distLabels;
// function updateDistChart(bins) {
//   let data = [];
//   distLabels = [];
//   for (let b of bins) {
//     let x0 = Math.round(b.x0*prec)/prec;
//     let x1 = Math.round(b.x1*prec)/prec;
//     data.push({x:x0, y:b.length});
//     distLabels.push(x0 + '-' + x1);
//   }

//   if (distChart) {
//     distChart.setData(data);
//   } else {
//       distChart = new Morris.Area({
//         // ID of the element in which to draw the chart.
//         element: 'dist-chart',
//         data: data,
//         // The name of the data record attribute that contains x-values.
//         xkey: 'x',
//         // A list of names of data record attributes that contain y-values.
//         ykeys: 'y',
//         ymin: 0,
//         labels: ['Freq'],
//         lineColors: ['#1fc231'],
//         xLabels: 'x',
//         xLabelAngle: 25,
//         xLabelFormat: binFmt,
//         //yLabelFormat: yFmt,
//         hideHover: true,
//         parseTime: false,
//         fillOpacity: 0.4,
//         pointSize: 1,
//         behaveLikeLine: false,
//         eventStrokeWidth: 2,
//         eventLineColors: ['#ccc'],
//       });
//   }
// }

// function binFmt(x) {
//   return distLabels[x.x] + ((app.pct_check && app.comp_check)? '%':'');
// }

// let trendChart = null
// function buildChartHtmlFromData(geoid = null) {
//   document.getElementById('longchart').innerHTML = '';
//   if (geoid) {
//     let selgeodata = [];
//     for (let yr of YR_LIST) {
//       let row = {};
//       row['year'] = yr.toString();
//       for (let met of app.metric_options) {
//         row[met] = base_lookup[geoid][met+""+yr];
//       }
//       selgeodata.push(row);
//     } 
//     console.log(selgeodata)
//     trendChart = new Morris.Line({
//       data: selgeodata,
//       element: 'longchart',
//       gridTextColor: '#aaa',
//       hideHover: true,
//       labels: [app.selected_metric.toUpperCase()],
//       lineColors: ['#f56e71'],
//       xkey: 'year',
//       smooth: false,
//       parseTime: false,
//       xLabelAngle: 45,
//       ykeys: [app.selected_metric],
//     });
//   } else {
//     trendChart = new Morris.Line({
//       data: _aggregateData,
//       element: 'longchart',
//       gridTextColor: '#aaa',
//       hideHover: true,
//       labels: [app.selected_metric.toUpperCase()],
//       lineColors: ['#f56e71'],
//       xkey: 'year',
//       smooth: false,
//       parseTime: false,
//       xLabelAngle: 45,
//       ykeys: [app.selected_metric],
//     });
//   }
// }

// functions for vue
async function selectionChanged(thing) {
  app.chartTitle = METRIC_DESC[app.selected_metric] + ' Trend';
  if (app.sliderValue && app.selected_metric) {
    let selfeat = await drawMapFeatures();
    if (selfeat) {
      highlightSelectedSegment();
      popSelGeo.setContent(getInfoHtml(selfeat));
    }
  }
}

function yrChanged(yr) {
  app.selected_year = yr;
  if (yr=='diff') {
    app.sliderValue = YR_LIST;
  } else {
    app.sliderValue = [yr,yr];
  }
  updateChords()
}

function metricChanged(metric) {
  app.selected_metric = metric;
}

function importanceChanged(importance) {
  app.selected_importance = importance;
}

// get the taz boundary data
async function fetchComments(comment) {
  const comment_url = API_SERVER + COMMENT_VIEW;
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
  select_year: '',
  select_metric: '',
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
  let timestamp = new Date();
  comment.select_year = app.selected_year;
  comment.select_metric = app.selected_metric;
  comment.add_layer = app.ADDLAYERS;
  comment.comment_user = getCookie("username");
  comment.comment_time = timestamp;
  comment.comment_content = app.comment;
  fetchComments(comment);
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(showPosition);
  } else {
    console.log("Geolocation is not supported by this browser.");
  }
  console.log(JSON.stringify(comment));
}

function getColorMode(cscheme) {
  if (app.modeMap.hasOwnProperty(cscheme.toString())) {
    return app.modeMap[cscheme];
  } else {
    return 'lrgb';
  }
}

// function customBreakPoints(thing) {
//   if(thing) {
//     app.isUpdActive = false;
//   } else {
//     drawMapFeatures();
//   }
// }

// async function updateColor(thing) {
//   app.isUpdActive = false;
//   let selfeat = await drawMapFeatures(false);
//   if (selfeat) {
//     highlightSelectedSegment();
//     popSelGeo.setContent(getInfoHtml(selfeat));
//   }
// }

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,

    // year
    year_options: [
      {text: 'Year 2015', value: '2015'},
      {text: 'Year 2050', value: '2050'},
      {text: 'Change', value: 'diff'},
      ],
    selected_year: '2015',
    // sliderValue: [YR_LIST[0],YR_LIST[0]],
    // comp_check: false,      // label for diff in time
    // pct_check: false,

    // purpose type
    selected_importance: 'mandatory',
    importance_options: [
    {text: 'Work / School', value: 'mandatory'},
    {text: 'Other', value: 'discretionary'},
    ],
    
    // transit type
    selected_metric: 'WALK',
    metric_options: [
    {text: 'Walk', value: 'WALK'},
    {text: 'Bike', value: 'BIKE'},
    {text: 'DA', value: 'DA'},
    {text: 'HOV2', value: 'HOV2'},
    {text: 'HOV3', value: 'HOV3'},
    {text: 'Transit', value: 'TRANSIT'},
    {text: 'TNC', value: 'TNC'},
    {text: 'School Bus', value: 'SCHBUS'},
    ],

    // comment box
    comment: '',

    // map color control
    selected_colorscheme: COLORRAMP.SEQ,
    modeMap: {
      '#ffffcc,#663399': 'lch',
      '#ebbe5e,#3f324f': 'hsl',
      '#ffffcc,#3f324f': 'hsl',
      '#3f324f,#ffffcc': 'hsl',
      '#fafa6e,#2A4858': 'lch',
    },

    // test for color schema
    // custom_check: false,
    // custom break points
    // bp0: 0.0,
    // bp1: 0.0,
    // bp2: 0.0,
    // bp3: 0.0,
    // bp4: 0.0,
    // bp5: 0.0,
    // bp6: 0.0,
    // bp7: 0.0,
    // bp8: 0.0,
    // bp9: 0.0,
    // bp10: 0.0,
    // // update after change custom break points
    // isUpdActive: false,
  },
  watch: {
    // sliderValue: selectionChanged,      // year choose
    selected_year:selectionChanged,
    selected_metric: selectionChanged,  // mode choose
    selected_importance: selectionChanged,
  },
  methods: {
    yrChanged: yrChanged,               // year change
    metricChanged: metricChanged,       // mode change
    importanceChanged: importanceChanged,
    handleSubmit: handleSubmit,
    clickToggleHelp: clickToggleHelp,   // help box
    clickedShowHide: clickedShowHide,   // hide sidebar
  },
});

let slideapp = new Vue({
  el: '#slide-panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
  },
  methods: {
    clickedShowHide: clickedShowHide,
  },
});

function clickedShowHide(e) {
  slideapp.isPanelHidden = !slideapp.isPanelHidden;
  app.isPanelHidden = slideapp.isPanelHidden;
  // leaflet map needs to be force-recentered, and it is slow.
  for (let delay of [50, 100, 150, 200, 250, 300, 350, 400, 450, 500]) {
    setTimeout(function() {
      mymap.invalidateSize()
    }, delay)
  }
}

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
