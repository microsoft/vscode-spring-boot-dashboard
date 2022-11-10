// Get access to the VS Code API from within the webview context
const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

// Main function that gets executed once the webview DOM loads
function main() {

  const graphTypeSelection = document.getElementById("graphType");
  graphTypeSelection.addEventListener("change", changeGraphDisplay);

  const processSelection = document.getElementById("process");
  processSelection.addEventListener("change", changeGraphDisplay);

  if(processSelection.options.length === 0) {
    vscode.postMessage({
      command: "LoadProcess",
      text: "Load process list",
    });
  }

  loadMetrics();
  setInterval(loadMetrics, interval);
  setInterval(fetchGraphData, interval);
  
  setVSCodeMessageListener();
}

function loadMetrics() {
  const processKey = document.getElementById("process").value;
  if(processKey !== '' || processKey !== undefined) {
    vscode.postMessage({
      command: "LoadMetrics",
      text: "Load metrics for the graph",
      processKey: Base64.decode(processKey),
    });
  }
}

function fetchGraphData() {
  const selection = document.getElementById("graphType");
  const graphType = selection.options[selection.selectedIndex].text;
  const processKey = document.getElementById("process").value;
  if(selection !== "" && processKey !== "") {
    vscode.postMessage({
      command: "FetchData",
      text: "Fetch data to plot the graph",
      processKey: Base64.decode(processKey),
      type: graphType,
    });
  } 
}

function changeGraphDisplay() {
  let chartStatus = Chart.getChart("chart");
  fetchGraphData();
  if (chartStatus !== undefined) {
      chartStatus.destroy();
  }
}

// Sets up an event listener to listen for messages passed from the extension context
// and executes code based on the message that is received
function setVSCodeMessageListener() {
  window.addEventListener("message", (event) => {
    const command = event.data.command;
    switch (command) {
      case "displayGraph":
        const graphData = JSON.parse(event.data.payload);
        displayGraphData(graphData);
        break;
      case "displayProcess":
        const process = event.data.process;
        displayProcess(process);
        break;
      case "removeProcess":
        const p = JSON.parse(event.data.process);
        removeProcess(p.liveProcess.processKey);
        break;
    }
  });
}

function displayProcess(process) {
  if(process !== '' && process !== undefined && Array.isArray(process)) {
    const processList = document.getElementById("process");
    for (let proc of process) { 
      var processKey = Base64.encode(proc.liveProcess.processKey);
      processList.insertAdjacentHTML("beforeend","<vscode-option id="+processKey+" value="+processKey+">"+proc.liveProcess.processName+"</vscode-option>");
    }
  } else if(process !== '' && process !== undefined) {
    const processList = document.getElementById("process");
    processList.insertAdjacentHTML("beforeend","<vscode-option id="+Base64.encode(process.liveProcess.processKey)+" value="+Base64.encode(process.liveProcess.processKey)+">"+process.liveProcess.processName+"</vscode-option>");
  }
}

function removeProcess(processKey) {
  if(processKey !== '' || processKey !== undefined) {
    var key = Base64.encode(processKey);
    const option = document.getElementById(key);
    option.remove(option.index);
    const currentSelection = document.getElementById("process").value;
    let chartStatus = Chart.getChart("chart");
    if (chartStatus !== undefined && currentSelection === key) {
        chartStatus.destroy();
    }
  }
}

function getMemoryData(data, memoryZones) {
  const dataPoint = {
    time: data[0].time
  };
  (memoryZones).forEach((zone, i) => {
      dataPoint[zone] = data[++i].measurements?.[0].value / 1_000_000;
  });
  dataPoint["committed"] = data[data.length - 2].measurements?.[0].value / 1_000_000;
  dataPoint["max"] = data[data.length - 1].measurements?.[0].value / 1_000_000;
  return dataPoint;
}

function displayGraphData(graphData) {
  const selection = document.getElementById("graphType");
  const graphType = selection.options[selection.selectedIndex].text;
  switch (graphType) {
    case "Heap Memory":
      var memoryZones = graphData[0][0].availableTags?.[0].values;
      var dataPoints = graphData.map(data => getMemoryData(data, memoryZones));
      plotMemoryGraph(dataPoints, memoryZones, graphType );
      break;
    case "Non Heap Memory":
      var memoryZones = graphData[0][0].availableTags?.[0].values;
      var dataPoints = graphData.map(data => getMemoryData(data, memoryZones));
      plotMemoryGraph(dataPoints, memoryZones, graphType);
      break;
    case "Gc Pauses":
      var extraData = {label: 'Max', prop: 'MAX', unit: 'ms'};
      var unit = "ms/s";
      var label = "Duration"
      plotGcGraph(graphData, "Gc Pauses", extraData, unit, label);
      break;
    case "Garbage Collections":
      var extraData = {label: 'Count', prop: 'TOTAL_TIME'};
      var label = "Count / second"
      plotGcGraph(graphData, "Garbage Collections", extraData, "", label);
      break;
    default:
  }
  
}

function currentUsedMemory(zones, graphData) {
  return zones
      .map((z) => graphData[z])
      .reduce((v, a) => a + v, 0);
}

function showMetrics(zones, graphData) {   
  return `Size `+ Math.round(graphData[0]["committed"]) + ` MB`
   +` / `+ `Used `+ Math.round(currentUsedMemory(zones, graphData[0])) + ` MB`
   +` / `+ `Max `+ Math.round(graphData[0]["max"])+ ` MB`;
}

function setMemoryData(chart, dataPoints, zones) {
  const labels = chart.labels;
  var sets = chart.datasets.length;
    dataPoints.map((d) => {
      if(!labels.includes(d.time)) {
        labels.push(d.time);
        zones.forEach((zone, i) => {
          chart.datasets[i].data.push(d[zone]);
        });
        chart.datasets[sets -1].data.push(d["committed"]);
      }
    })
}

function getLabels(data) {
  var res = data.map(m => m.time);
  return res;
}

function plotMemoryGraph(graphData, zones, graphType) {
  const COLORS = [
    ["#c4e8c1", "#5eb84d"],
    ["#f5c162", "#ffa500"],
    ["#9987ad", "#75539e"],
    ["#d4b0d4", "#e362e3"],
    ["#92bed2", "#3282bf"],
    ["#f5d28c", "#f0debb"]
  ];

  var ctx = document.getElementById("chart").getContext("2d");
  var dataset = [];
  zones.forEach((zone, i) => {
    dataset.push({
      label: zone,
      stacked: true,
      stack: "stack 0",
      backgroundColor: COLORS[i][0],
      borderColor: COLORS[i][1],
      fillColor: COLORS[i][0],
      fill: true,
      data: []
    })
  });

  // committed dataset
  dataset.push({
    label: "Committed",
    stacked: false,
    backgroundColor: "#c9cbcf",
    borderColor: "#a0a1a3",
    fillColor: "#c9cbcf",
    fill: true,
    data: []
  })

  var data = {
    labels: [],
    datasets: dataset
  };
  var options = {
    animation: false,
    scales: {
      x: [{
        type: 'time',
        display: true,
        title: {
          display: true,
          text: 'Date'
        },
        ticks: {
          major: {
            enabled: true
          },
      }
    }],
    y: {
      suggestedMin: 0,
      suggestedMax: graphData["committed"],
      stacked: true,
      ticks: {
        callback: function(value, index, ticks) {
          return value + 'MB';
        }
      }
    }
   },
    plugins: {
      title: {
        display: true,
        position: "top",
        text: [graphType, showMetrics(zones, graphData)]
      },
    tooltip: {
      mode: 'index',
      itemSort: function(a, b) {
        return b.datasetIndex - a.datasetIndex
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
    legend: {
      display: true,
      position: "bottom",
      labels: {
        boxHeight: 0
      }
    }
  },
  };
  let chartStatus = Chart.getChart("chart");
  if (chartStatus === undefined) {
      var memChart = new Chart(ctx, {
        type: 'line',
        data: data,
        options: options
      });

      memChart.data.labels.shift();
  }
  var chart = Chart.getChart("chart");
  
  var datapoints = chart.data.datasets[0].data.length;

  setMemoryData(chart.data, graphData, zones)
  if(datapoints >= maxDataPoints) {
    chart.data.labels.shift();
    chart.data.datasets.forEach((d) => {
    d.data.shift();
  });

  }
  chart.update();
}


function formula(next, prev, type) {
  if(type === "Gc Pauses")
   {
    return next.count < prev.count ? 1000 * (next.total - prev.total) / (next.count - prev.count) : 0;
   }
  return next.count - prev.count;
}

function showGcMetrics(unit, extraData, data) {
  return extraData.label +': '+ Math.round(data[0].measurements.find(x => x.statistic === extraData.prop)?.value) + unit; 
}

function setGcPausesData(chart, dataPoints , type) {
  const labels = chart.labels;
  

  dataPoints.map((d) => {
    if(!labels.includes(d[0].time)) {
      const prev = chart.datasets[0].prevMeasurement;
      labels.push(d[0].time);
      if (prev) {
        var dataPoint = getGcPausesData(d[0]);
        const pt = {
            time: d[0].time,
            gc: formula(dataPoint, prev, type)
        }
        chart.datasets[0].prevMeasurement = dataPoint;
        chart.datasets[0].data.push(pt);
     }
    }
  })
}

function getGcPausesData(data) {
  const gcPause = {
    total: data.measurements.find(x => x.statistic === 'TOTAL_TIME')?.value,
    count: data.measurements.find(x => x.statistic === 'COUNT')?.value,
    max: data.measurements.find(x => x.statistic === 'MAX')?.value
  }
  return gcPause;
}

function plotGcGraph(graphData, type, extraData, unit, label) {
  var ctx = document.getElementById("chart").getContext("2d");
  var dataset = {
    label: label,
    stacked: false,
    backgroundColor: "#e86682",
    borderColor: "#ed2d56",
    fillColor: "#e86682",
    data: [],
    prevMeasurement: {},
    parsing: {
      xAxisKey: 'time',
      yAxisKey: 'gc'
    },
  }

  var data = {
    labels: [],
    datasets: [dataset]
  };
  var options = {
    animation: false,
    scales: {
      x: [{
        type: 'time',
        display: true,
        title: {
          display: true,
          text: 'Date'
        },
        ticks: {
          major: {
            enabled: true
          },
      }
    }],
    y: {
      min: 0,
      ticks: {
        callback: function(value, index, ticks) {
          return value + unit;
        }
      }
    }
   },
   plugins: {
    title: {
      display: true,
      position: "top",
      text: ['Gc Pauses', showGcMetrics(unit, extraData, graphData[0])]
    },
   tooltip: {
    mode: 'index'
   },
   interaction: {
    mode: 'nearest',
    axis: 'x',
    intersect: false,
  },
  legend: {
    display: true,
    position: "bottom",
    labels: {
      boxHeight: 0
    }
  }
 },
  };
  let chartStatus = Chart.getChart("chart");
  if (chartStatus === undefined) {
      var gcChart = new Chart(ctx, {
        type: 'line',
        data: data,
        options: options
      });

      var gcPause = {
        total: graphData[0][0].measurements.find(x => x.statistic === 'TOTAL_TIME')?.value,
        count: graphData[0][0].measurements.find(x => x.statistic === 'COUNT')?.value,
        max: graphData[0][0].measurements.find(x => x.statistic === 'MAX')?.value
      }
      gcChart.data.datasets[0].prevMeasurement= gcPause
      gcChart.data.labels.shift();
  }

  var chart = Chart.getChart("chart");
  
  var datapoints = chart.data.datasets[0].data.length;
  setGcPausesData(chart.data, graphData, type);
  if(datapoints >= maxDataPoints) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();

}

