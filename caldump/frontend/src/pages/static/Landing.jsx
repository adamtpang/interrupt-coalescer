import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Container, Typography, CircularProgress, Stack, Link, Paper } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import GoogleIcon from '@mui/icons-material/Google';
import SwitchAccountIcon from '@mui/icons-material/SwitchAccount';

export default function Landing() {
    const { user, hasLicense, login, logout } = useAuth();
    const navigate = useNavigate();
    const [stripeLoaded, setStripeLoaded] = useState(false);

    useEffect(() => {
        if (user && hasLicense) {
            navigate('/app');
        }
        setStripeLoaded(true);
    }, [user, hasLicense, navigate]);

    const handleSwitchAccount = async () => {
        await logout();
        await login();
    };

    return (
        <Container
            maxWidth="sm"
            sx={{
                textAlign: 'center',
                py: { xs: 0, sm: 4 },
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100vh'
            }}
        >
            <Paper
                elevation={1}
                sx={{
                    p: { xs: 2, sm: 4 },
                    bgcolor: '#ffffff',
                    borderRadius: { xs: 0, sm: 2 },
                    border: { xs: 0, sm: '1px solid' },
                    borderColor: '#c0c0c0',
                    boxShadow: { xs: 'none', sm: '0 2px 8px rgba(0,0,0,0.1)' },
                    minHeight: { xs: '100vh', sm: 'auto' }
                }}
            >
                <Typography
                    variant="h2"
                    component="h1"
                    gutterBottom
                    fontWeight="bold"
                    sx={{
                        mb: 1,
                        fontSize: { xs: '2rem', sm: '3.75rem' }
                    }}
                >
                    caldump.com
                </Typography>

                <Box sx={{ mb: { xs: 4, sm: 6 } }}>
                    <img
                        src="/caldump-screenshot.png"
                        alt="caldump.com screenshot"
                        style={{
                            width: '100%',
                            height: 'auto',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}
                    />
                </Box>

                <Stack spacing={3} sx={{ mb: { xs: 4, sm: 6 }, textAlign: 'left' }}>
                    <Box>
                        <Typography variant="h6" gutterBottom color="primary">
                            The Problem
                        </Typography>
                        <Typography variant="body1">
                            Creating multiple calendar events is tedious. You have to enter each event one by one, wasting time on repetitive clicks.
                        </Typography>
                    </Box>

                    <Box>
                        <Typography variant="h6" gutterBottom color="primary">
                            The Solution
                        </Typography>
                        <Typography variant="body1">
                            Paste a list of tasks. They'll be automatically scheduled in your available time slots.
                        </Typography>
                    </Box>

                    <Box>
                        <Typography variant="h6" gutterBottom color="primary">
                            How It Works
                        </Typography>
                        <Typography component="div">
                            1. Sign in with Google Calendar<br />
                            2. Enter your tasks (one per line)<br />
                            3. Click schedule - done
                        </Typography>
                    </Box>
                </Stack>

                {!user ? (
                    <Button
                        variant="contained"
                        size="large"
                        startIcon={<GoogleIcon />}
                        onClick={login}
                        sx={{
                            mt: 2,
                            py: { xs: 1.5, sm: 2 },
                            px: { xs: 4, sm: 6 },
                            fontSize: { xs: '1rem', sm: '1.1rem' },
                            fontWeight: 'bold'
                        }}
                    >
                        Sign in with Google
                    </Button>
                ) : !hasLicense ? (
                    <Box sx={{ mt: 4 }}>
                        <Box sx={{
                            minHeight: 50,
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: 2
                        }}>
                            <Box sx={{ position: 'relative' }}>
                                {!stripeLoaded && <CircularProgress size={30} sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />}
                                <stripe-buy-button
                                    buy-button-id="buy_btn_1QUgqHFL7C10dNyGlq3U4URR"
                                    publishable-key="pk_live_51J7Ti4FL7C10dNyGubXiYMWwF6jPahwvwDjXXooFE9VbI1Brh6igKsmNKAqmFoYflQveSCQ8WR1N47kowzJ1drrQ00ijl4Euus"
                                />
                            </Box>
                            <Button
                                variant="outlined"
                                startIcon={<SwitchAccountIcon />}
                                onClick={handleSwitchAccount}
                                sx={{ height: 40 }}
                            >
                                Switch Account
                            </Button>
                        </Box>
                        <Typography variant="body2" color="primary" sx={{ mt: 2, fontWeight: 'medium' }}>
                            Use {user.email} for purchase
                        </Typography>
                    </Box>
                ) : (
                    <Button
                        variant="contained"
                        size="large"
                        onClick={() => navigate('/app')}
                        sx={{
                            mt: 2,
                            py: { xs: 1.5, sm: 2 },
                            px: { xs: 4, sm: 6 },
                            fontSize: { xs: '1rem', sm: '1.1rem' },
                            fontWeight: 'bold'
                        }}
                    >
                        Go to App
                    </Button>
                )}
            </Paper>

            <Box sx={{
                mt: { xs: 2, sm: 4 },
                opacity: 0.7,
                pb: { xs: 4, sm: 0 }
            }}>
                <Link href="https://adampang.com" target="_blank" rel="noopener" color="text.secondary" underline="hover">
                    by adampang.com
                </Link>
            </Box>
        </Container>
    );
}