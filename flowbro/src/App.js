import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [flowStartTime, setFlowStartTime] = useState(null);
  const [restStartTime, setrestStartTime] = useState(null);
  const [FlowTime, setFlowTime] = useState(0);
  const [restTime, setRestTime] = useState(0);
  const [flowActive, setFlowActive] = useState(false);
  const [restActive, setRestActive] = useState(false);
  const [ratio, setRatio] = useState(5);
  const [totalFlowTime, setTotalFlowTime] = useState(0);

  const alertSound = useRef(new Audio(`${process.env.PUBLIC_URL}/alert-sound.mp3`));

  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = new Date().getTime();

      if (flowActive) {
        const elapsed = Math.floor((currentTime - flowStartTime) / 1000);
        const newFlowTime = elapsed;
        setFlowTime(newFlowTime);
        setTotalFlowTime(newFlowTime);
        setRestTime(newFlowTime / ratio);
      }

      if (restActive) {
        const elapsed = Math.floor((currentTime - restStartTime) / 1000);
        const newRestTime = restTime - elapsed;
        let newFlowTime = totalFlowTime - elapsed * ratio;

        if (newRestTime <= 0) {
          alertSound.current.play();
          setRestActive(false);
          setRestTime(0); // Reset to 0 if it goes below
        } else {
          setRestTime(newRestTime);
        }

        if (newFlowTime <= 0) {
          setFlowTime(0); // Reset to 0 if it goes below
          setTotalFlowTime(0);
        } else {
          setFlowTime(newFlowTime);
          setTotalFlowTime(newFlowTime);
        }

        setrestStartTime(currentTime); // Update restStartTime to the current time
      }

    }, 1000);

    return () => {
      clearInterval(interval);
    };

  }, [flowActive, restActive, flowStartTime, restStartTime, FlowTime, restTime, ratio, totalFlowTime]);

  useEffect(() => {
    setRestTime(totalFlowTime / ratio);
  }, [ratio, totalFlowTime]);

  const toggleflow = () => {
    setFlowStartTime(new Date().getTime() - FlowTime * 1000);
    setFlowActive(!flowActive);
    setRestActive(false);
  };

  const toggleRest = () => {
    if (restTime > 0) {
      setrestStartTime(new Date().getTime());
      setRestActive(!restActive);
      setFlowActive(false);
    }
  };

  return (
    <div className="App">
      <div>
        <h1>Flow Time: {FlowTime}s</h1>
        <button onClick={toggleflow}>{flowActive ? "Pause" : "Start"}</button>
      </div>
      <div>
        <h1>Rest Time: {Math.floor(restTime)}s</h1>
        <button onClick={toggleRest}>{restActive ? "Pause" : "Start"}</button>
      </div>
      <div>
        <h2>Flow-to-Rest Ratio</h2>
        <input
          type="number"
          value={ratio}
          onChange={(e) => {
            const newRatio = Number(e.target.value);
            if (newRatio > 0) {
              setRatio(newRatio);
            }
          }}
        />
      </div>
    </div>
  );
}

export default App;
