import React, { useState, useEffect } from 'react';
import {
    Container,
    Box,
    Typography,
    TextField,
    Button,
    Paper,
    Alert,
    CircularProgress,
    AppBar,
    Toolbar,
    Tabs,
    Tab,
    Avatar,
    styled
} from '@mui/material';
import { googleCalendarService } from '../../services/googleCalendar';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import GoogleIcon from '@mui/icons-material/Google';
import RockBandView from '../../components/RockBandView';

const StyledAppBar = styled(AppBar)(({ theme }) => ({
    background: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(8px)',
    borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
}));

const StyledTabs = styled(Tabs)(({ theme }) => ({
    minHeight: 48,
    '& .MuiTab-root': {
        minHeight: 48,
        textTransform: 'none',
        fontWeight: 600,
    }
}));

function TabPanel({ children, value, index }) {
    return (
        <Box role="tabpanel" hidden={value !== index} sx={{ pt: 3 }}>
            {value === index && children}
        </Box>
    );
}

// Parse tasks from deconstructor output
function parseTasks(input) {
    const lines = input.split('\n');
    const tasks = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines
        if (!trimmed) continue;

        // Skip milestone headers (🎯)
        if (trimmed.startsWith('🎯')) continue;

        // Skip "Break down" indicators
        if (trimmed.includes('⚛️') || trimmed.includes('Break down')) continue;

        // Skip duration indicators
        if (trimmed.startsWith('≤') || trimmed.match(/^\d+m$/)) continue;

        // This is a task!
        tasks.push(trimmed);
    }

    return tasks;
}

export default function Dashboard() {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0);
    const [tasks, setTasks] = useState('');
    const [loading, setLoading] = useState('');
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Listen for auth state changes
    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSignIn = async () => {
        try {
            setLoading('Signing in...');
            await googleCalendarService.refreshToken();
            setLoading(false);
        } catch (err) {
            console.error('Sign in error:', err);
            setError('Failed to sign in. Please try again.');
            setLoading(false);
        }
    };

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
        setError(null);
        setSuccess(null);
    };

    const handleSchedule = async () => {
        try {
            setLoading('Parsing tasks...');
            setError(null);
            setSuccess(null);

            const taskList = parseTasks(tasks);

            if (taskList.length === 0) {
                throw new Error('No tasks found. Make sure each task is on its own line.');
            }

            setLoading(`Scheduling ${taskList.length} tasks...`);

            await googleCalendarService.scheduleRockBandTasks(
                taskList,
                (progress) => {
                    setLoading(`Scheduling (${progress.completed}/${progress.total})...`);
                }
            );

            setSuccess(`🎸 ${taskList.length} tasks scheduled! Switch to "Play" tab to see them.`);
            setTasks('');
            setLoading(false);
        } catch (error) {
            console.error('Error scheduling tasks:', error);
            setError(error.message);
            setLoading(false);
        }
    };

    // Show loading while checking auth
    if (authLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    // Show sign-in screen if not authenticated
    if (!user) {
        return (
            <Box sx={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.default',
                p: 3
            }}>
                <Typography variant="h3" sx={{ mb: 2 }}>🎸</Typography>
                <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
                    caldump
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 4, textAlign: 'center' }}>
                    Rock Band for your to-do list
                </Typography>

                {error && (
                    <Alert severity="error" sx={{ mb: 2, maxWidth: 300 }}>
                        {error}
                    </Alert>
                )}

                <Button
                    variant="contained"
                    size="large"
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <GoogleIcon />}
                    onClick={handleSignIn}
                    disabled={!!loading}
                    sx={{ px: 4, py: 1.5 }}
                >
                    {loading || 'Sign in with Google'}
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <StyledAppBar position="sticky">
                <Container maxWidth="sm" disableGutters>
                    <Toolbar sx={{ px: '24px !important' }}>
                        <Typography
                            variant="h6"
                            component="div"
                            sx={{
                                flexGrow: 1,
                                fontWeight: 'bold',
                                color: theme => theme.palette.primary.main,
                                ml: -1
                            }}
                        >
                            🎸 caldump
                        </Typography>
                        <Avatar
                            src={user.photoURL}
                            alt={user.displayName}
                            sx={{ width: 32, height: 32 }}
                        />
                    </Toolbar>
                    <StyledTabs
                        value={tabValue}
                        onChange={handleTabChange}
                        centered
                        sx={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}
                    >
                        <Tab icon={<RocketLaunchIcon />} label="Schedule" iconPosition="start" />
                        <Tab icon={<MusicNoteIcon />} label="Play" iconPosition="start" />
                    </StyledTabs>
                </Container>
            </StyledAppBar>

            <Container maxWidth="sm" sx={{ mt: 2, pb: 4 }}>
                {/* Schedule Mode */}
                <TabPanel value={tabValue} index={0}>
                    <Paper elevation={3} sx={{ p: 3 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Paste your deconstructed tasks:
                        </Typography>
                        <TextField
                            multiline
                            rows={12}
                            fullWidth
                            placeholder={`🎯 Your Goal

Task 1 from deconstructor
⚛️ Break down
≤3m

Task 2 from deconstructor
⚛️ Break down
≤3m`}
                            value={tasks}
                            onChange={(e) => setTasks(e.target.value)}
                            disabled={!!loading}
                            sx={{ mb: 2, fontFamily: 'monospace' }}
                        />

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                            Each task → 3 min calendar block + 1 min rest gap
                        </Typography>

                        {error && (
                            <Alert severity="error" sx={{ mb: 2 }}>
                                {error}
                            </Alert>
                        )}

                        {success && (
                            <Alert severity="success" sx={{ mb: 2 }}>
                                {success}
                            </Alert>
                        )}

                        <Button
                            fullWidth
                            variant="contained"
                            onClick={handleSchedule}
                            disabled={!!loading || !tasks.trim()}
                            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <RocketLaunchIcon />}
                            size="large"
                        >
                            {loading || 'Schedule Now 🎸'}
                        </Button>
                    </Paper>
                </TabPanel>

                {/* Play Mode - Rock Band View */}
                <TabPanel value={tabValue} index={1}>
                    <RockBandView />
                </TabPanel>
            </Container>
        </Box>
    );
}