window.addEventListener("error", function () {
  if (!window.qaCalculatorReady) {
    var status = document.getElementById("calc-status");
    if (status) {
      status.textContent = "Cannot start. Reload, or update Android System WebView / Chrome.";
      status.className = "error";
    }
  }
}, true);
