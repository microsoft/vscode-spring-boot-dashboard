// Get access to the VS Code API from within the webview context
const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

// Main function that gets executed once the webview DOM loads
function main() {
  changeGraphDisplay();
  const graphTypeSelection = document.getElementById("graphType");
  graphTypeSelection.addEventListener("change", changeGraphDisplay);
  setInterval(refreshData, 50000);
  
  setVSCodeMessageListener();
}

function refreshData() {
  const e = document.getElementById("graphType");
  vscode.postMessage({
    command: "refresh",
    text: "Refresh the graph data",
    type: e.value
  });
}

function changeGraphDisplay() {
  const graphType = document.getElementById("graphType");

  vscode.postMessage({
    command: graphType.options[graphType.selectedIndex].text,
    text: "Display the graph"
  });
}

// Sets up an event listener to listen for messages passed from the extension context
// and executes code based on the message that is received
function setVSCodeMessageListener() {
  window.addEventListener("message", (event) => {
    const command = event.data.command;
    const graphData = JSON.parse(event.data.payload);
    switch (command) {
      case "displayGraph":
        displayGraphData(graphData);
        break;
      case "test":
        displayGraphData(graphData);
        break;
      case "refreshGraph":
        break;
    }
  });
}

function displayGraphData(graphData) {
  const icon = document.getElementById("icon");
  const summary = document.getElementById("summary");

  const graphType = document.getElementById("graphType");
  switch (graphType.options[graphType.selectedIndex].text) {
    case "Heap Memory":
      summary.textContent = getGraph(graphData, "Heap Memory");
      icon.textContent = getGraphIcon(graphType);
      break;
    case "Gc Pauses":
      summary.textContent = getGraph(graphData, "Gc pauses");
      icon.textContent = getGraphIcon(graphType);
      break;
    default:
      summary.textContent = "Change in graph type"
      icon.textContent = getGraphIcon("");
  }
  
}

function getGraph(graphData, type) {
  console.log(graphData)
  if (type === "Heap Memory") {
    return `${graphData[0].name}:${graphData[0].measurements[0].value}</br> 
    ${graphData[1].name}:${graphData[1].measurements[0].value}</br>
    ${graphData[2].name}:${graphData[2].measurements[0].value}`;
  }
  return `${graphData[0].name}, ${graphData[0].description}</br>
  ${graphData[0].measurements[0].statistic}:${graphData[0].measurements[0].value}`;
}

function getGraphIcon(graphTypeSelection) {
  let icon = "";

  switch (graphTypeSelection) {
    case "Heap Memory":
      icon = "🌤";
      break;
    case "Non Heap Memory":
      icon = "🌥";
      break;
    case "Gc Pauses":
      icon = "☀️";
      break;
    case "Garbage Collections":
      icon = "☁️";
      break;
    default:
      icon = "✨";
  }

  return icon;
}
