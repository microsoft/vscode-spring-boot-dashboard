// Get access to the VS Code API from within the webview context
const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

// Main function that gets executed once the webview DOM loads
function main() {
  const graphTypeSelection = document.getElementById("graphType");
  graphTypeSelection.addEventListener("change", changeGraphDisplay);

  const processSelection = document.getElementById("process");
  processSelection.addEventListener("change", changeGraphDisplay);

  setInterval(refreshData, 10000);
  
  setVSCodeMessageListener();
}

function refreshData() {
  const selection = document.getElementById("graphType");
  const processKey = document.getElementById("process").value;
  const graphType= selection.options[selection.selectedIndex].text;
  switch (graphType) {
    case "Heap Memory":
      vscode.postMessage({
        command: "Refresh",
        text: "Refresh the graph data",
        processKey: processKey,
        type: selection.value,
        tag: "area:heap"
      });
      break;
    case "Non Heap Memory":
      vscode.postMessage({
        command: "Refresh",
        text: "Refresh the graph data",
        processKey: processKey,
        type: selection.value,
        tag: "area:nonheap"
      });
      break;
    case "Gc Pauses":
      vscode.postMessage({
        command: "Refresh",
        text: "Refresh the graph data",
        processKey: processKey,
        type: selection.value,
        tag: ""
      });
      break;
    case "Garbage Collections":
      vscode.postMessage({
        command: "Refresh",
        text: "Refresh the graph data",
        processKey: processKey,
        type: selection.value,
        tag: ""
      });
      break;
  }
}

function changeGraphDisplay() {
  let chartStatus = Chart.getChart("chart");
  if (chartStatus !== undefined) {
      chartStatus.destroy();
  }
  refreshData();
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
        const process = JSON.parse(event.data.process);
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
  if(process !== '' || process !== undefined) {
    const processList = document.getElementById("process");
    processList.insertAdjacentHTML("beforeend","<vscode-option id="+process.liveProcess.processKey+" value="+process.liveProcess.processKey+">"+process.liveProcess.processName+"</vscode-option>");
    refreshData();
  }
}

function removeProcess(processKey) {
  if(processKey !== '' || processKey !== undefined) {
    const option = document.getElementById(processKey);
    option.remove(option.index);
    refreshData();
    const currentSelection = document.getElementById("process").value;
    let chartStatus = Chart.getChart("chart");
    if (chartStatus !== undefined && currentSelection === processKey) {
        chartStatus.destroy();
    }
  }
}

function timestamp() {
  const date = new Date().toTimeString();
  const chop = date.indexOf(' ');
  return date.substr(0, chop);
}

function getMemoryData(data, memoryZones) {
  const dataPoint = {
    time: timestamp()
  };
  (memoryZones).forEach((zone, i) => {
      dataPoint[zone] = data[++i].measurements?.[0].value / 1_000_000;
  });
  dataPoint["committed"] = data[data.length - 2].measurements?.[0].value / 1_000_000;
  dataPoint["max"] = data[data.length - 1].measurements?.[0].value / 1_000_000;
  return dataPoint;
}

function displayGraphData(graphData) {
  console.log(graphData);
  const selection = document.getElementById("graphType");
  const graphType = selection.options[selection.selectedIndex].text;
  switch (graphType) {
    case "Heap Memory":
      var memoryZones = graphData[0].availableTags?.[0].values;
      var dataPoint = getMemoryData(graphData, memoryZones);
      plotMemoryGraph(dataPoint, memoryZones, graphType );
      break;
    case "Non Heap Memory":
      var memoryZones = graphData[0].availableTags?.[0].values;
      var dataPoint = getMemoryData(graphData, memoryZones);
      plotMemoryGraph(dataPoint, memoryZones, graphType);
      break;
    case "Gc Pauses":
      var extraData = {label: 'Max', prop: 'MAX', unit: 'ms'};
      var unit = "ms/s";
      var label = "Duration"
      plotGcGraph(graphData[0], "Gc Pauses", extraData, unit, label);
      break;
    case "Garbage Collections":
      var extraData = {label: 'Count', prop: 'TOTAL_TIME'};
      var label = "Count / second"
      plotGcGraph(graphData[0], "Garbage Collections", extraData, "", label);
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
  return `Size `+ Math.round(graphData["committed"]) + ` MB`
   +` / `+ `Used `+ Math.round(currentUsedMemory(zones, graphData)) + ` MB`
   +` / `+ `Max `+ Math.round(graphData["max"])+ ` MB`;
}

function setMemoryLabels(labels, time) {
  labels.push(time);
}

function setMemoryData(data, zone, dataPoint) {
  data.push(dataPoint[zone]);
}

function plotMemoryGraph(graphData, zones, graphType) {
  const COLORS = [
    ["#87ba80", "#74b567"],
    ["#f7869e", "#f7486d"],
    ["#6e8ac2", "#6283c4"],
    ["#ff9f40", "#f58618"],
    ["#92bed2", "#3282bf"],
    ["#f5d28c", "#f5b10f"],
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
      // pointStrokeColor: "#FFFFFF",
      // pointHighlightFill: "#FFFFFF",
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
    // pointStrokeColor: "#FFFFFF",
    // pointHighlightFill: "#FFFFFF",
    data: []
  })

  var data = {
    labels: [graphData.time],
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
  var sets = chart.data.datasets.length

  zones.forEach((zone, i) => {
    setMemoryData(chart.data.datasets[i].data, zone, graphData);
  });
  setMemoryData(chart.data.datasets[sets -1].data, "committed", graphData);
  setMemoryLabels(chart.data.labels, graphData.time);
  if(datapoints === 10) {
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
  return extraData.label +': '+ Math.round(data.measurements.find(x => x.statistic === extraData.prop)?.value) + unit; 
}

function setGcPausesData(data, point, type) {
  const prev = data.datasets[0].prevMeasurement;

  if (prev) {
    var dataPoint = getGcPausesData(point);
    const pt = {
        time: timestamp(),
        gc: formula(dataPoint, prev, type)
    }
    data.datasets[0].prevMeasurement = dataPoint;
    data.datasets[0].data.push(pt);
    data.labels.push(pt.time);
 }
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
    // pointStrokeColor: "#FFFFFF",
    // pointHighlightFill: "#FFFFFF",
    data: [],
    prevMeasurement: {},
    parsing: {
      xAxisKey: 'time',
      yAxisKey: 'gc'
    },
  }

  var data = {
    labels: [graphData.time],
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
      text: ['Gc Pauses', showGcMetrics(unit, extraData, graphData)]
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
        total: graphData.measurements.find(x => x.statistic === 'TOTAL_TIME')?.value,
        count: graphData.measurements.find(x => x.statistic === 'COUNT')?.value,
        max: graphData.measurements.find(x => x.statistic === 'MAX')?.value
      }
      gcChart.data.datasets[0].prevMeasurement= gcPause
      gcChart.data.labels.shift();
  }

  var chart = Chart.getChart("chart");
  
  var datapoints = chart.data.datasets[0].data.length;
  setGcPausesData(chart.data, graphData, type, datapoints);
  if(datapoints === 10) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();

}

