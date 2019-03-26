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
// import d3 from 'd3';

// some important global variables.
// the data source
const API_SERVER = 'https://api.sfcta.org/api/';
const DATA_VIEW = 'connectsf_trippattern';
const COMMENT_VIEW = 'connectsf_comment';
const YEAR_LIST = ['2015', '2050'];
const METRIC_LIST = ['walk/bike', 'transit', 'uber/lyft', 'drivealone', 'shareddrive'];
// color schema


const D_DISTRICT = ['downtown', 'soma', 'n_beach_and_chinatown', 'western_market',
                  'mission_and_potrero', 'noe_and_glen_and_bernal',
                  'marina_and_n_heights', 'richmond', 'bayshore', 'outer_mission',
                  'hill_districts', 'sunset', 'south_bay', 'east_bay', 'north_bay'];
const O_DISTRICT = ['Downtown', 'SoMa', 'N. Beach/Chinatown', 'Western Market',
                    'Mission/Potrero', 'Noe/Glen/Bernal', 'Marina/N. Heights',
                    'Richmond', 'Bayshore', 'Outer Mission', 'Hill Districts',
                    'Sunset', 'South Bay', 'East Bay', 'North Bay'];
const MUTE_DD = ['south_bay', 'east_bay', 'north_bay'];
const MUTE_OD = ['South Bay', 'East Bay', 'North Bay'];
const DISTRICT_COLORRAMP = [{district:'Downtown', color:'#cf1130'},
                            {district:'SoMa',color: '#f47a8d'},
                            {district:'N. Beach/Chinatown',color:'#f8a7b4'},
                            {district:'Western Market',color:'#4B256D'},
                            {district:'Mission/Potrero',color:'#6F5495'},
                            {district:'Noe/Glen/Bernal',color:'#A09ED6'},
                            {district:'Marina/N. Heights',color:"3F647E"},
                            {district:'Richmond',color:'#688FAD'},
                            {district:'Bayshore',color:'#7caac3'},
                            {district:'Outer Mission',color:'#006466'},
                            {district:'Hill Districts',color:'#2fa3a5'},
                            {district:'Sunset',color:'#95D47A'},
                            {district:'South Bay',color:'#677C8A'},
                            {district:'East Bay',color:'#B2A296'},
                            {district:'North Bay',color:'#a3a3a3'}];

// const D_DISTRICT = ['marina_and_n_heights', 'n_beach_and_chinatown', 'downtown', 'soma', 'western_market',
//                   'mission_and_potrero', 'noe_and_glen_and_bernal',
//                   'bayshore', 'outer_mission',
//                   'hill_districts',  'east_bay', 'south_bay', 'sunset', 'richmond', 'north_bay'];
// const O_DISTRICT = ['Marina/N. Heights', 'N. Beach/Chinatown', 'Downtown', 'SoMa', 'Western Market',
//                     'Mission/Potrero', 'Noe/Glen/Bernal', 
//                     'Bayshore', 'Outer Mission', 'Hill Districts',
//                     'East Bay', 'South Bay', 'Sunset', 'Richmond', 'North Bay'];
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

//create number formatting functions
var formatPercent = d3.format("%");
var numberWithCommas = d3.format("0,f");

// main function
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
  for (let yr of YEAR_LIST) {
    tmp[yr] = {};
    for (let imp of app.importance_options) {
      tmp[yr][imp.value] = {};
      for (let met of METRIC_LIST) {
        tmp[yr][imp.value][met] = {};
        for (let od of O_DISTRICT) {
          tmp[yr][imp.value][met][od] = {};
          for (let dd of D_DISTRICT) {
            tmp[yr][imp.value][met][od][dd] = 0;
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
      for (let met of METRIC_LIST) {
        for (let i=0; i<O_DISTRICT.length; i++) {
          let od = O_DISTRICT[i];
          for (let dd of D_DISTRICT) {
            if (MUTE_OD.includes(od) && MUTE_DD.includes(dd)) {
              _aggregateData[yr][imp.value][met][i].push(0);
            } else {
              _aggregateData[yr][imp.value][met][i].push(tmp[yr][imp.value][met][od][dd]);
            }
          }
        }
      }
    }
  }
  
  // calculate the aggregate "total" in mode metric
  for (let yr of YEAR_LIST) {
    for (let imp of app.importance_options) {
      for (let i=0; i<O_DISTRICT.length; i++) {
        let od = O_DISTRICT[i];
        for (let dd of D_DISTRICT) {
          _aggregateData[yr][imp.value]['total'][i][dd] = 0;
          let total_data = 0;
          for (let met of METRIC_LIST) {
            total_data += tmp[yr][imp.value][met][od][dd];
          }
          if (MUTE_OD.includes(od) && MUTE_DD.includes(dd)) {
            _aggregateData[yr][imp.value]['total'][i].push(0);
          } else {
            _aggregateData[yr][imp.value]['total'][i].push(total_data);
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
  console.log(_aggregateData);
}

var width = 900,
    height = 900,
    outerRadius = Math.min(width, height) / 2 - 120,
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

async function drawMapFeatures() {
  var matrix = _aggregateData[app.selected_year][app.selected_importance][app.selected_metric];
  /* Compute chord layout. */
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
        .duration(1500)
        .attr("opacity", 0)
        .remove(); //remove after transitions are complete
  
  var newGroups = groupG.enter()
                        .append("g")
                        .attr("class", "group");

  //Create the title tooltip for the new groups
  newGroups.append("title");
  //Update the (tooltip) title text based on the data
  groupG.select("title")
        .text(function(d, i) {
          return numberWithCommas(d.value) 
              + " trip from " 
              + DISTRICT_COLORRAMP[i].district;
        });

  //create the arc paths and set the constant attributes
  //(those based on the group index, not on the value)
  newGroups.append("path")
           .attr("id", function (d) {
              return "group" + d.index;
              //using d.index and not i to maintain consistency
              //even if groups are sorted
           })
           .style("fill", function (d) {
              return DISTRICT_COLORRAMP[d.index].color;
           });
  
  //update the paths to match the layout
  groupG.select("path") 
        .transition()
        .duration(1500)
        //.attr("opacity", 0.5) //optional, just to observe the transition////////////
        .attrTween("d", arcTween( last_layout ));
        // .transition().duration(100).attr("opacity", 1); //reset opacity//////////////
  
  //create the labels
  newGroups.append("svg:text")
          .attr("xlink:href", function (d) {
            return "#group" + d.index;
          })
          // .attr("dy", "14px")
          // .attr("color", "white")
          .text(function (d) {
            return DISTRICT_COLORRAMP[d.index].district; 
          });

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
                    .data(layout.chords(), chordKey);
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
            .text(function(d) {
                if (DISTRICT_COLORRAMP[d.target.index].district !== DISTRICT_COLORRAMP[d.source.index].district) {
                    return [numberWithCommas(d.source.value),
                            " trips from ",
                            DISTRICT_COLORRAMP[d.source.index].district,
                            " to ",
                            DISTRICT_COLORRAMP[d.target.index].district,
                            "\n",
                            numberWithCommas(d.target.value),
                            " trips from ",
                            DISTRICT_COLORRAMP[d.target.index].district,
                            " to ",
                            DISTRICT_COLORRAMP[d.source.index].district
                            ].join(""); 
                        //joining an array of many strings is faster than
                        //repeated calls to the '+' operator, 
                        //and makes for neater code!
                } 
                else { //source and target are the same
                    return numberWithCommas(d.source.value) 
                        + " trips ended in " 
                        + DISTRICT_COLORRAMP[d.source.index].district;
                }
            });

  //handle exiting paths:
  chordPaths.exit().transition()
      .duration(1500)
      .attr("opacity", 0)
      .remove();

  //update the path shape
  chordPaths.transition()
      .duration(1500)
      .attr("opacity", 0.5) //optional, just to observe the transition
      .style("fill", function (d) {
          return DISTRICT_COLORRAMP[d.source.index].color;
      })
      .attrTween("d", chordTween(last_layout))
      .transition().duration(100).attr("opacity", 1) //reset opacity
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
  /*
  function disableButton(buttonNode) {
      d3.selectAll("button")
          .attr("disabled", function(d) {
              return this === buttonNode? "true": null;
          });
  }
  */
}

// functions for vue
async function selectionChanged() {
  await drawMapFeatures();
}

function yrChanged(yr) {
  app.selected_year = yr;
  if (yr=='diff') {
  //   app.sliderValue = YR_LIST;
  // } else {
  //   app.sliderValue = [yr,yr];
  }
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

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,

    // year
    year_options: [
      {text: '2015', value: '2015'},
      {text: '2050', value: '2050'},
      {text: 'Change', value: 'diff'},
      ],
    selected_year: '2015',
    // sliderValue: [YR_LIST[0],YR_LIST[0]],
    // comp_check: false,      // label for diff in time

    // purpose type
    selected_importance: 'mandatory',
    importance_options: [
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
    {text: 'Drive Alone', value: 'drivealone'},
    {text: 'Shared Drive', value: 'shareddrive'},
    ],

    // comment box
    comment: '',

    // map color control
    // selected_colorscheme: COLORRAMP.SEQ,
    // modeMap: {
    //   '#ffffcc,#663399': 'lch',
    //   '#ebbe5e,#3f324f': 'hsl',
    //   '#ffffcc,#3f324f': 'hsl',
    //   '#3f324f,#ffffcc': 'hsl',
    //   '#fafa6e,#2A4858': 'lch',
    // },
  },
  watch: {
    // sliderValue: selectionChanged,      // year choose
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
