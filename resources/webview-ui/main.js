(function () {
  // Get access to the VS Code API from within the webview context
  const vscode = acquireVsCodeApi();

  let loadMetricsTimer;
  let fetchGraphDataTimer;

  // <-- start main func
  const graphTypeSelection = document.getElementById("graphType");
  graphTypeSelection.addEventListener("change", changeGraphDisplay);

  const processSelection = document.getElementById("dropdown-processList");
  processSelection.addEventListener("change", changeGraphDisplay);

  if (processSelection.options.length === 0) {
    vscode.postMessage({
      command: "LoadProcess",
      text: "Load process list",
    });
  }

  loadMetrics();
  loadInitialGraph();

  loadMetricsTimer = setInterval(loadMetrics, interval);
  fetchGraphDataTimer = setInterval(fetchGraphData, interval);

  setVSCodeMessageListener();
  // end main func -->

  function loadInitialGraph() {
    const graphTypeSelection = document.getElementById("graphType");
    const graphType = graphTypeSelection.options[graphTypeSelection.selectedIndex].text;

    vscode.postMessage({
      command: "FetchData",
      text: "Fetch data to plot the graph",
      processKey: "",
      type: graphType,
    });
  }

  function loadMetrics() {
    const processKey = document.getElementById("dropdown-processList").value;
    if (processKey !== '' || processKey !== undefined) {
      vscode.postMessage({
        command: "LoadMetrics",
        text: "Load metrics for the graph",
        processKey: window.atob(processKey),
      });
    }
  }

  function fetchGraphData() {
    const selection = document.getElementById("graphType");
    const graphType = selection.options[selection.selectedIndex].text;
    const processKey = document.getElementById("dropdown-processList").value;
    if (selection !== "" && processKey !== "") {
      vscode.postMessage({
        command: "FetchData",
        text: "Fetch data to plot the graph",
        processKey: window.atob(processKey),
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

  function refreshMetrics() {
    clearInterval(loadMetricsTimer);
    clearInterval(fetchGraphDataTimer);
    loadMetrics();
    loadMetricsTimer = setInterval(loadMetrics, interval);
    fetchGraphDataTimer = setInterval(fetchGraphData, interval);
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
          const processes = event.data.processes;
          displayProcess(processes);
          break;
        case "removeProcess":
          const p = JSON.parse(event.data.process);
          removeProcess(p.liveProcess.processKey);
          break;
        case "updateSettings":
          interval = event.data.interval;
          maxDataPoints = event.data.maxDataPoints;
          refreshMetrics();
          break;
      }
    });
  }

  function displayProcess(processes) {
    if (processes !== '' && processes !== undefined && Array.isArray(processes)) {
      const processList = document.getElementById("dropdown-processList");
      for (let proc of processes) {
        var processKey = window.btoa(proc.processKey);
        processList.insertAdjacentHTML("beforeend", `<vscode-option id="${processKey}" value="${processKey}">${proc.type === "local" ? (proc.appName + " (pid: " + proc.pid + ")") : (proc.remoteAppName + " (remote)")}</vscode-option>`);
      }
    }
  }

  function removeProcess(processKey) {
    if (processKey !== '' || processKey !== undefined) {
      var key = window.btoa(processKey);
      const option = document.getElementById(key);
      option.remove(option.index);
      const currentSelection = document.getElementById("dropdown-processList").value;
      let chartStatus = Chart.getChart("chart");
      if (chartStatus !== undefined && currentSelection === key) {
        chartStatus.destroy();
        loadInitialGraph();
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
        plotMemoryGraph(dataPoints, memoryZones, graphType);
        break;
      case "Non Heap Memory":
        var memoryZones = graphData[0][0].availableTags?.[0].values;
        var dataPoints = graphData.map(data => getMemoryData(data, memoryZones));
        plotMemoryGraph(dataPoints, memoryZones, graphType);
        break;
      case "Gc Pauses":
        var extraData = { label: 'Max', prop: 'MAX', unit: 'ms' };
        var unit = "ms/s";
        var label = "Duration"
        plotGcGraph(graphData, "Gc Pauses", extraData, unit, label);
        break;
      case "Garbage Collections":
        var extraData = { label: 'Count', prop: 'TOTAL_TIME' };
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

  function getMetricsOverview(zones, graphData) {
    const lastData = graphData[graphData.length - 1];
    return [
      `Size ${Math.round(lastData["committed"])} MB`,
      `Used ${Math.round(currentUsedMemory(zones, lastData))} MB`,
      `Max ${Math.round(lastData["max"])} MB`
    ].join(" / ");
  }

  function setMemoryData(chart, dataPoints, zones) {
    const labels = chart.labels;
    var sets = chart.datasets.length;
    dataPoints.map((d) => {
      if (!labels.includes(d.time)) {
        labels.push(d.time);
        zones.forEach((zone, i) => {
          chart.datasets[i].data.push(d[zone]);
        });
        chart.datasets[sets - 1].data.push(d["committed"]);
      }
    })
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
        stack: "Used",
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
      fill: false,
      data: []
    })

    var data = {
      labels: [],
      datasets: dataset
    };
    var options = {
      color: cssVar("--vscode-foreground"),
      animation: false,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            display: false
          }
        },
        y: {
          suggestedMin: 0,
          suggestedMax: graphData["committed"],
          stacked: true,
          title: {
            display: true,
            text: 'MB',
            padding: -2,
            labelOffset: -5,
          },
          grid: {
            z: 100
          }
        }
      },
      plugins: {
        title: {
          display: true,
          position: "top",
          text: [graphType, getMetricsOverview(zones, graphData)],
          color: cssVar("--vscode-foreground")
        },
        tooltip: {
          mode: 'index',
          itemSort: function (a, b) {
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
            boxHeight: 0,
            boxWidth: 15
          },
          color: cssVar("--vscode-foreground")
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

    // update title
    chart.options.plugins.title.text = [graphType, getMetricsOverview(zones, graphData)];
    setMemoryData(chart.data, graphData, zones);

    while (datapoints >= maxDataPoints) {
      chart.data.labels.shift();
      chart.data.datasets.forEach((d) => {
        d.data.shift();
      });
      datapoints = datapoints - 1;
    }

    chart.update();
  }


  function formula(next, prev, type) {
    if (type === "Gc Pauses") {
      return next.count < prev.count ? 1000 * (next.total - prev.total) / (next.count - prev.count) : 0;
    }
    return next.count - prev.count;
  }

  function getGcMetricsOverview(unit, extraData, data) {
    const lastData = data[data.length - 1];
    return extraData.label + ': ' + Math.round(lastData.measurements.find(x => x.statistic === extraData.prop)?.value) + unit;
  }

  function setGcPausesData(chart, dataPoints, type) {
    const labels = chart.labels;

    dataPoints.map((d) => {
      if (!labels.includes(d[0].time)) {
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
      maintainAspectRatio: false,
      scales: {
        x: {},
        y: {
          min: 0,
          title: {
            display: true,
            text: unit,
            padding: -2,
            labelOffset: -5
          }
        }
      },
      plugins: {
        title: {
          display: true,
          position: "top",
          text: ['Gc Pauses', getGcMetricsOverview(unit, extraData, graphData[0])]
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
            boxHeight: 0,
            boxWidth: 15
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
      gcChart.data.datasets[0].prevMeasurement = gcPause
      gcChart.data.labels.shift();
    }

    var chart = Chart.getChart("chart");

    var datapoints = chart.data.datasets[0].data.length;

    // update title
    chart.options.plugins.title.text = ['Gc Pauses', getGcMetricsOverview(unit, extraData, graphData[0])];
    setGcPausesData(chart.data, graphData, type);

    while (datapoints >= maxDataPoints) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
      datapoints = datapoints - 1;
    }

    chart.update();

  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name);
  }

}())
