import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  IconButton,
  LinearProgress,
  Chip,
  styled,
  keyframes
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import RefreshIcon from '@mui/icons-material/Refresh';
import TimerIcon from '@mui/icons-material/Timer';
import SelfImprovementIcon from '@mui/icons-material/SelfImprovement';

// Animations
const pulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.9; }
`;

const breathe = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
`;

// Styled components
const TimerRing = styled(Box)(({ theme, mode, progress }) => ({
  width: 200,
  height: 200,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
  position: 'relative',
  background: mode === 'work'
    ? `conic-gradient(${theme.palette.primary.main} ${progress * 360}deg, rgba(0,0,0,0.1) 0deg)`
    : `conic-gradient(${theme.palette.success.main} ${progress * 360}deg, rgba(0,0,0,0.1) 0deg)`,
  animation: mode === 'rest' ? `${breathe} 4s ease-in-out infinite` : 'none',
  '&::before': {
    content: '""',
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: '50%',
    background: theme.palette.background.paper,
  }
}));

const TimerContent = styled(Box)({
  position: 'relative',
  zIndex: 1,
  textAlign: 'center',
});

const TaskItem = styled(ListItem)(({ theme, active }) => ({
  borderRadius: 8,
  marginBottom: 4,
  background: active ? `${theme.palette.primary.main}15` : 'transparent',
  border: active ? `2px solid ${theme.palette.primary.main}` : '2px solid transparent',
  transition: 'all 0.3s ease',
}));

const ChipAwayButton = styled(Button)(({ theme }) => ({
  padding: '16px 48px',
  fontSize: '1.2rem',
  fontWeight: 'bold',
  borderRadius: 12,
  animation: `${pulse} 2s ease-in-out infinite`,
  '&:hover': {
    animation: 'none',
    transform: 'scale(1.02)',
  }
}));

// Work duration options (in seconds)
const WORK_DURATIONS = [
  { label: '5 min', value: 5 * 60 },
  { label: '10 min', value: 10 * 60 },
];

const REST_DURATION = 60; // 1 minute rest

// Audio notification using Web Audio API
const playDing = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    console.log('Audio not available');
  }
};

export default function FlowTimer() {
  const [tasks, setTasks] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState('idle'); // 'idle', 'work', 'rest'
  const [workDuration, setWorkDuration] = useState(WORK_DURATIONS[0].value);

  const intervalRef = useRef(null);

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress (0 to 1)
  const getProgress = () => {
    const totalTime = mode === 'work' ? workDuration : REST_DURATION;
    return totalTime > 0 ? (totalTime - timeRemaining) / totalTime : 0;
  };

  // Handle adding tasks
  const handleAddTasks = () => {
    const newTasks = inputValue
      .split('\n')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .map(text => ({ text, completed: false }));

    if (newTasks.length > 0) {
      setTasks([...tasks, ...newTasks]);
      setInputValue('');
    }
  };

  // Start working on current task
  const handleChipAway = useCallback(() => {
    if (tasks.length === 0 || currentTaskIndex >= tasks.length) return;

    setMode('work');
    setTimeRemaining(workDuration);
    setIsRunning(true);
  }, [tasks.length, currentTaskIndex, workDuration]);

  // Pause/Resume timer
  const handlePauseResume = () => {
    setIsRunning(!isRunning);
  };

  // Skip to next task
  const handleSkip = () => {
    if (currentTaskIndex < tasks.length - 1) {
      setCurrentTaskIndex(prev => prev + 1);
      setMode('idle');
      setIsRunning(false);
      setTimeRemaining(0);
    }
  };

  // Mark current task as complete
  const handleComplete = (index) => {
    const newTasks = [...tasks];
    newTasks[index].completed = !newTasks[index].completed;
    setTasks(newTasks);
  };

  // Reset everything
  const handleReset = () => {
    setTasks([]);
    setCurrentTaskIndex(0);
    setTimeRemaining(0);
    setIsRunning(false);
    setMode('idle');
  };

  // Timer logic
  useEffect(() => {
    if (isRunning && timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
    } else if (timeRemaining === 0 && isRunning) {
      // Timer finished
      playDing();

      if (mode === 'work') {
        // Switch to rest
        setMode('rest');
        setTimeRemaining(REST_DURATION);
      } else if (mode === 'rest') {
        // Rest finished, go idle and wait for next chip away
        setMode('idle');
        setIsRunning(false);

        // Move to next task if current is not the last
        if (currentTaskIndex < tasks.length - 1) {
          setCurrentTaskIndex(prev => prev + 1);
        }
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timeRemaining, mode, currentTaskIndex, tasks.length]);

  const currentTask = tasks[currentTaskIndex];
  const allCompleted = tasks.length > 0 && tasks.every(t => t.completed);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Task Input */}
      {tasks.length === 0 && (
        <Paper elevation={3} sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', mb: 2 }}>
            🎯 What do you need to chip away at?
          </Typography>
          <TextField
            multiline
            rows={6}
            fullWidth
            placeholder={`Enter your tasks (one per line):

Read 3 paragraphs of that book
Reply to 2 emails
Review one section of the proposal
Make one phone call`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button
            fullWidth
            variant="contained"
            onClick={handleAddTasks}
            disabled={!inputValue.trim()}
            size="large"
          >
            Load Tasks
          </Button>
        </Paper>
      )}

      {/* Timer Display */}
      {tasks.length > 0 && (
        <>
          {/* Work Duration Selector */}
          {mode === 'idle' && (
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mb: 2 }}>
              {WORK_DURATIONS.map((d) => (
                <Chip
                  key={d.value}
                  label={d.label}
                  onClick={() => setWorkDuration(d.value)}
                  color={workDuration === d.value ? 'primary' : 'default'}
                  variant={workDuration === d.value ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
          )}

          {/* Timer Ring */}
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
            <TimerRing mode={mode} progress={getProgress()}>
              <TimerContent>
                {mode === 'idle' ? (
                  <>
                    <TimerIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Ready
                    </Typography>
                  </>
                ) : mode === 'work' ? (
                  <>
                    <Typography variant="h3" sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
                      {formatTime(timeRemaining)}
                    </Typography>
                    <Typography variant="body2" color="primary" sx={{ fontWeight: 'bold' }}>
                      FOCUS
                    </Typography>
                  </>
                ) : (
                  <>
                    <SelfImprovementIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
                    <Typography variant="h4" sx={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
                      {formatTime(timeRemaining)}
                    </Typography>
                    <Typography variant="body2" color="success.main" sx={{ fontWeight: 'bold' }}>
                      REST
                    </Typography>
                  </>
                )}
              </TimerContent>
            </TimerRing>
          </Box>

          {/* Current Task Display */}
          {currentTask && (
            <Paper
              elevation={2}
              sx={{
                p: 2,
                textAlign: 'center',
                background: mode === 'work' ? 'linear-gradient(135deg, #667eea15 0%, #764ba215 100%)' : 'inherit'
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Task {currentTaskIndex + 1} of {tasks.length}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mt: 0.5 }}>
                {currentTask.text}
              </Typography>
            </Paper>
          )}

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, my: 2 }}>
            {mode === 'idle' && !allCompleted && (
              <ChipAwayButton
                variant="contained"
                color="primary"
                onClick={handleChipAway}
                startIcon={<PlayArrowIcon />}
              >
                Chip Away
              </ChipAwayButton>
            )}

            {(mode === 'work' || mode === 'rest') && (
              <>
                <IconButton onClick={handlePauseResume} size="large" color="primary">
                  {isRunning ? <PauseIcon /> : <PlayArrowIcon />}
                </IconButton>
                <IconButton onClick={handleSkip} size="large" disabled={currentTaskIndex >= tasks.length - 1}>
                  <SkipNextIcon />
                </IconButton>
              </>
            )}
          </Box>

          {allCompleted && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h4" sx={{ mb: 2 }}>🎉</Typography>
              <Typography variant="h6" color="success.main" sx={{ fontWeight: 'bold' }}>
                All tasks completed!
              </Typography>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={handleReset}
                sx={{ mt: 2 }}
              >
                Start Fresh
              </Button>
            </Box>
          )}

          {/* Task List */}
          <Paper elevation={1} sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Task Queue
            </Typography>
            <List dense>
              {tasks.map((task, index) => (
                <TaskItem
                  key={index}
                  active={index === currentTaskIndex && !task.completed}
                  dense
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox
                      checked={task.completed}
                      onChange={() => handleComplete(index)}
                      size="small"
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={task.text}
                    sx={{
                      textDecoration: task.completed ? 'line-through' : 'none',
                      opacity: task.completed ? 0.5 : 1
                    }}
                  />
                  {index === currentTaskIndex && !task.completed && (
                    <Chip label="Current" size="small" color="primary" variant="outlined" />
                  )}
                </TaskItem>
              ))}
            </List>
          </Paper>

          {/* Reset Button */}
          <Button
            variant="text"
            color="inherit"
            startIcon={<RefreshIcon />}
            onClick={handleReset}
            sx={{ alignSelf: 'center', opacity: 0.6 }}
          >
            Reset All
          </Button>
        </>
      )}
    </Box>
  );
}
