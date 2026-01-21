import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Paper,
    styled,
    keyframes,
    CircularProgress
} from '@mui/material';
import { googleCalendarService } from '../services/googleCalendar';

// Animations
const pulse = keyframes`
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
  50% { transform: scale(1.02); box-shadow: 0 0 20px 10px rgba(99, 102, 241, 0); }
`;

const slideDown = keyframes`
  from { transform: translateY(-20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

// Styled components
const TrackContainer = styled(Box)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '20px 0',
    minHeight: '70vh',
    position: 'relative',
    '&::before': {
        content: '""',
        position: 'absolute',
        left: '50%',
        top: 0,
        bottom: 0,
        width: 2,
        background: 'linear-gradient(to bottom, transparent, rgba(99, 102, 241, 0.3), transparent)',
        transform: 'translateX(-50%)',
    }
}));

const NoteCard = styled(Paper)(({ theme, status }) => ({
    padding: '16px 24px',
    width: '100%',
    maxWidth: 400,
    textAlign: 'center',
    transition: 'all 0.3s ease',
    animation: `${slideDown} 0.3s ease-out`,
    position: 'relative',
    ...(status === 'current' && {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        transform: 'scale(1.05)',
        animation: `${pulse} 2s ease-in-out infinite`,
        zIndex: 10,
    }),
    ...(status === 'upcoming' && {
        background: theme.palette.background.paper,
        opacity: 0.7,
        transform: 'scale(0.95)',
    }),
    ...(status === 'rest' && {
        background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
        color: 'white',
        animation: `${pulse} 3s ease-in-out infinite`,
    }),
}));

const TimeDisplay = styled(Typography)(({ theme }) => ({
    fontFamily: 'monospace',
    fontSize: '2.5rem',
    fontWeight: 'bold',
    letterSpacing: 2,
}));

const StatusBadge = styled(Box)(({ status }) => ({
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: 20,
    fontSize: '0.75rem',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 8,
    ...(status === 'current' && {
        background: 'rgba(255,255,255,0.2)',
    }),
    ...(status === 'upcoming' && {
        background: 'rgba(99, 102, 241, 0.1)',
        color: '#667eea',
    }),
    ...(status === 'rest' && {
        background: 'rgba(255,255,255,0.2)',
    }),
}));

// Audio notification
const playDing = () => {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Pleasant chime sound
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
        oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
        console.log('Audio not available');
    }
};

// Format time remaining
const formatTimeRemaining = (ms) => {
    if (ms <= 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Format time as HH:MM
const formatTime = (date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function RockBandView() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [now, setNow] = useState(new Date());
    const [lastEventId, setLastEventId] = useState(null);

    const fetchEvents = async () => {
        try {
            const upcomingEvents = await googleCalendarService.getUpcomingEvents(2);
            setEvents(upcomingEvents);
            setError(null);
        } catch (err) {
            console.error('Error fetching events:', err);
            setError('Could not load calendar events');
        } finally {
            setLoading(false);
        }
    };

    // Fetch events on mount and refresh every 30 seconds
    useEffect(() => {
        fetchEvents();
        const interval = setInterval(fetchEvents, 30000);
        return () => clearInterval(interval);
    }, []);

    // Update "now" every second for live countdown
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Find current and upcoming events
    const getCurrentAndUpcoming = () => {
        const currentTime = now.getTime();

        let currentEvent = null;
        let upcomingEvents = [];
        let isRestPeriod = false;
        let nextEventStart = null;

        for (const event of events) {
            if (!event.start?.dateTime) continue;

            const start = new Date(event.start.dateTime).getTime();
            const end = new Date(event.end.dateTime).getTime();

            if (currentTime >= start && currentTime < end) {
                currentEvent = event;
            } else if (currentTime < start) {
                upcomingEvents.push(event);
                if (!nextEventStart) nextEventStart = start;
            }
        }

        // If no current event but there are upcoming events, we're in a rest period
        if (!currentEvent && upcomingEvents.length > 0) {
            isRestPeriod = true;
        }

        return { currentEvent, upcomingEvents: upcomingEvents.slice(0, 5), isRestPeriod, nextEventStart };
    };

    const { currentEvent, upcomingEvents, isRestPeriod, nextEventStart } = getCurrentAndUpcoming();

    // Play ding when current event changes
    useEffect(() => {
        if (currentEvent && currentEvent.id !== lastEventId) {
            playDing();
            setLastEventId(currentEvent.id);
        }
    }, [currentEvent?.id]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="error">{error}</Typography>
            </Box>
        );
    }

    if (events.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="h4" sx={{ mb: 2 }}>🎸</Typography>
                <Typography variant="h6" color="text.secondary">
                    No upcoming events
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Schedule some tasks to see them here
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ animation: `${fadeIn} 0.5s ease-out` }}>
            {/* Current status */}
            <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Typography variant="overline" color="text.secondary">
                    {formatTime(now)}
                </Typography>
            </Box>

            <TrackContainer>
                {/* Rest period indicator */}
                {isRestPeriod && nextEventStart && (
                    <NoteCard status="rest" elevation={4}>
                        <StatusBadge status="rest">Rest</StatusBadge>
                        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                            🧘 Take a breath
                        </Typography>
                        <TimeDisplay>
                            {formatTimeRemaining(nextEventStart - now.getTime())}
                        </TimeDisplay>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                            until next task
                        </Typography>
                    </NoteCard>
                )}

                {/* Current event */}
                {currentEvent && (
                    <NoteCard status="current" elevation={8}>
                        <StatusBadge status="current">Now Playing</StatusBadge>
                        <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                            {currentEvent.summary}
                        </Typography>
                        <TimeDisplay>
                            {formatTimeRemaining(new Date(currentEvent.end.dateTime).getTime() - now.getTime())}
                        </TimeDisplay>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                            remaining
                        </Typography>
                    </NoteCard>
                )}

                {/* Upcoming events */}
                {upcomingEvents.map((event, index) => (
                    <NoteCard
                        key={event.id}
                        status="upcoming"
                        elevation={1}
                        sx={{
                            opacity: 1 - (index * 0.15),
                            transform: `scale(${1 - (index * 0.03)})`,
                        }}
                    >
                        <StatusBadge status="upcoming">
                            {formatTime(event.start.dateTime)}
                        </StatusBadge>
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                            {event.summary}
                        </Typography>
                    </NoteCard>
                ))}

                {/* More indicator */}
                {upcomingEvents.length >= 5 && (
                    <Typography variant="caption" color="text.secondary">
                        + more events coming...
                    </Typography>
                )}
            </TrackContainer>
        </Box>
    );
}
