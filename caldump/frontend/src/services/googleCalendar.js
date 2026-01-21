import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

// Firebase config
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase if not already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

class GoogleCalendarService {
    constructor() {
        this.auth = getAuth(app);
        this.db = getFirestore(app);
        console.log('GoogleCalendarService initialized');
    }

    async init() {
        console.log('Initializing Google Calendar service...');
        return Promise.resolve();
    }

    async refreshToken() {
        console.log('Refreshing Google token...');
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/calendar.events.freebusy');
        provider.addScope('https://www.googleapis.com/auth/calendar.events');
        provider.setCustomParameters({
            access_type: 'offline',
            prompt: 'consent'
        });

        try {
            const result = await signInWithPopup(this.auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);

            if (!credential?.accessToken) {
                throw new Error('No access token received');
            }

            // Store the new token
            await setDoc(doc(this.db, 'users', result.user.uid), {
                googleAuth: {
                    accessToken: credential.accessToken,
                    lastUpdated: new Date().toISOString()
                }
            }, { merge: true });

            return credential.accessToken;
        } catch (error) {
            console.error('Error refreshing token:', error);
            throw error;
        }
    }

    async getToken() {
        console.log('Getting token for Google Calendar API...');
        const user = this.auth.currentUser;

        if (!user) {
            console.error('No user signed in');
            throw new Error('No user signed in');
        }

        try {
            console.log('Fetching user document from Firestore:', user.uid);
            const userDoc = await getDoc(doc(this.db, 'users', user.uid));

            if (!userDoc.exists()) {
                console.error('User document not found in Firestore');
                throw new Error('User data not found');
            }

            const userData = userDoc.data();
            console.log('User data retrieved:', {
                hasGoogleAuth: !!userData.googleAuth,
                hasAccessToken: !!userData.googleAuth?.accessToken,
                lastUpdated: userData.googleAuth?.lastUpdated
            });

            const accessToken = userData.googleAuth?.accessToken;
            const lastUpdated = userData.googleAuth?.lastUpdated;

            // If token is older than 50 minutes, refresh it
            if (!accessToken || !lastUpdated ||
                (new Date().getTime() - new Date(lastUpdated).getTime()) > 50 * 60 * 1000) {
                console.log('Token expired or missing, refreshing...');
                return await this.refreshToken();
            }

            console.log('Using existing access token');
            return accessToken;
        } catch (error) {
            console.error('Error getting token:', error);
            if (error.message.includes('No access token found')) {
                return await this.refreshToken();
            }
            throw error;
        }
    }

    async findAvailableSlots(startTime, endTime, durationMinutes) {
        console.log('Finding available slots...', { startTime, endTime, durationMinutes });

        const token = await this.getToken();
        console.log('Token obtained for finding slots');

        // Ensure we're not scheduling in the past
        const now = new Date();
        if (startTime < now) {
            console.log('Start time is in the past, adjusting to current time');
            startTime = now;
            // Round up to next 30-minute mark
            const minutes = startTime.getMinutes();
            const roundedMinutes = Math.ceil(minutes / 30) * 30;
            startTime.setMinutes(roundedMinutes);
            startTime.setSeconds(0);
            startTime.setMilliseconds(0);
        }

        // If the adjusted start time is after end time, move to next day
        if (startTime >= endTime) {
            console.log('Start time is after end time, moving to next day');
            startTime = new Date(endTime);
            startTime.setDate(startTime.getDate() + 1);
            startTime.setHours(6, 0, 0, 0); // Reset to 6 AM next day

            endTime = new Date(startTime);
            endTime.setHours(18, 0, 0, 0); // Set to 6 PM same day
        }

        // Look ahead for 20 days maximum (Google Calendar API limit)
        const maxEndTime = new Date(startTime);
        maxEndTime.setDate(maxEndTime.getDate() + 20);
        maxEndTime.setHours(18, 0, 0, 0); // Set to 6 PM on the last day

        console.log('Searching for slots between:', {
            start: startTime.toLocaleString(),
            end: endTime.toLocaleString(),
            maxEnd: maxEndTime.toLocaleString()
        });

        const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                timeMin: startTime.toISOString(),
                timeMax: maxEndTime.toISOString(),
                items: [{ id: 'primary' }],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('FreeBusy API error:', errorText);
            throw new Error('Failed to fetch free/busy information');
        }

        const data = await response.json();
        console.log('FreeBusy API response:', data);

        const busySlots = data.calendars.primary.busy;
        console.log('Busy slots:', busySlots);

        // Find available slots
        const availableSlots = [];
        let currentTime = new Date(startTime);
        let currentEndTime = new Date(endTime);

        // Helper function to round time to nearest 30-minute mark
        const roundToNearestSlot = (time) => {
            const roundedTime = new Date(time);
            const minutes = roundedTime.getMinutes();
            const roundedMinutes = Math.round(minutes / 30) * 30;
            roundedTime.setMinutes(roundedMinutes);
            roundedTime.setSeconds(0);
            roundedTime.setMilliseconds(0);
            return roundedTime;
        };

        // Continue searching until we hit maxEndTime or find enough slots
        while (currentTime < maxEndTime) {
            // Check slots for current day
            while (currentTime < currentEndTime) {
                // Round current time to nearest 30-minute mark
                currentTime = roundToNearestSlot(currentTime);
                const slotEnd = new Date(currentTime.getTime() + durationMinutes * 60000);

                // Check if this slot overlaps with any busy periods
                const isSlotAvailable = !busySlots.some(busy => {
                    const busyStart = new Date(busy.start);
                    const busyEnd = new Date(busy.end);
                    return (currentTime < busyEnd && slotEnd > busyStart);
                });

                if (isSlotAvailable && slotEnd <= currentEndTime) {
                    availableSlots.push({
                        start: new Date(currentTime),
                        end: slotEnd,
                    });
                }

                // Move to next 30-minute mark
                currentTime.setMinutes(currentTime.getMinutes() + 30);
            }

            // Move to next day
            currentTime = new Date(currentEndTime);
            currentTime.setDate(currentTime.getDate() + 1);
            currentTime.setHours(6, 0, 0, 0); // Reset to 6 AM

            currentEndTime = new Date(currentTime);
            currentEndTime.setHours(18, 0, 0, 0); // Set to 6 PM

            console.log('Moving to next day:', currentTime.toLocaleString());
        }

        if (availableSlots.length === 0) {
            throw new Error('No available slots found in the next 20 days');
        }

        console.log('Found available slots:', availableSlots.map(slot => ({
            start: slot.start.toLocaleString(),
            end: slot.end.toLocaleString()
        })));

        return availableSlots;
    }

    async createEvents(slots, tasks, onProgress) {
        console.log('Creating events...', { slots, tasks });

        const token = await this.getToken();
        console.log('Token obtained for creating events');

        const user = this.auth.currentUser;
        const totalEvents = slots.length;
        let completedEvents = 0;

        // Helper function to create a single event with retry logic
        const createSingleEvent = async (slot, task, retryCount = 0) => {
            const event = {
                summary: task,
                start: {
                    dateTime: slot.start.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                end: {
                    dateTime: slot.end.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                description: `Created by ${user.displayName || user.email} via caldump.com`,
            };

            console.log('Creating event:', event);

            try {
                const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(event),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Failed to create event:', errorText);

                    // If rate limited and haven't retried too many times, wait and retry
                    if (response.status === 403 && retryCount < 3) {
                        console.log(`Rate limited, waiting before retry ${retryCount + 1}...`);
                        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1))); // Exponential backoff
                        return createSingleEvent(slot, task, retryCount + 1);
                    }

                    throw new Error('Failed to create event');
                }

                return response.json();
            } catch (error) {
                console.error('Error creating event:', error);
                throw error;
            }
        };

        const startTime = Date.now();

        // Create events sequentially with delay between each
        for (let i = 0; i < slots.length; i++) {
            if (!tasks[i]) continue;

            if (i > 0) {
                // Add delay between event creations
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            await createSingleEvent(slots[i], tasks[i]);
            completedEvents++;

            // Calculate progress and time estimates
            const progress = completedEvents / totalEvents;
            const elapsedTime = Date.now() - startTime;
            const estimatedTotalTime = elapsedTime / progress;
            const remainingTime = estimatedTotalTime - elapsedTime;
            const remainingSeconds = Math.ceil(remainingTime / 1000);

            // Call progress callback if provided
            if (onProgress) {
                onProgress({
                    completed: completedEvents,
                    total: totalEvents,
                    progress: progress,
                    remainingSeconds: remainingSeconds
                });
            }
        }

        console.log('All events created successfully');
    }

    // Schedule tasks Rock Band style: 3 min work + 1 min gap, starting NOW
    async scheduleRockBandTasks(tasks, onProgress) {
        console.log('Scheduling Rock Band style tasks:', tasks);

        const token = await this.getToken();
        const user = this.auth.currentUser;
        const totalEvents = tasks.length;
        let completedEvents = 0;

        // Start from NOW, rounded to next minute
        let currentTime = new Date();
        currentTime.setSeconds(0);
        currentTime.setMilliseconds(0);
        currentTime.setMinutes(currentTime.getMinutes() + 1); // Start next minute

        const WORK_DURATION = 3; // 3 minutes
        const REST_DURATION = 1; // 1 minute gap (work/5 ≈ 36 sec, rounded to 1 min)

        const startTime = Date.now();

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            if (!task) continue;

            // Calculate start and end times
            const eventStart = new Date(currentTime);
            const eventEnd = new Date(currentTime.getTime() + WORK_DURATION * 60000);

            const event = {
                summary: task,
                start: {
                    dateTime: eventStart.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                end: {
                    dateTime: eventEnd.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                description: `Created by ${user?.displayName || user?.email || 'caldump'} via caldump.com`,
                colorId: '9', // Blue color
            };

            console.log('Creating event:', { task, start: eventStart.toLocaleTimeString(), end: eventEnd.toLocaleTimeString() });

            if (i > 0) {
                // Add delay between API calls to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            try {
                const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(event),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Failed to create event:', errorText);
                    throw new Error(`Failed to create event: ${task}`);
                }

                completedEvents++;

                // Calculate progress
                if (onProgress) {
                    const progress = completedEvents / totalEvents;
                    const elapsedTime = Date.now() - startTime;
                    const remainingSeconds = Math.ceil((elapsedTime / progress - elapsedTime) / 1000);
                    onProgress({
                        completed: completedEvents,
                        total: totalEvents,
                        progress,
                        remainingSeconds,
                        currentTask: task
                    });
                }
            } catch (error) {
                console.error('Error creating event:', error);
                throw error;
            }

            // Move to next slot: work duration + rest gap
            currentTime = new Date(eventEnd.getTime() + REST_DURATION * 60000);
        }

        console.log('All Rock Band events scheduled!');
        return { count: completedEvents };
    }

    // Get upcoming events for Rock Band visualization
    async getUpcomingEvents(hours = 2) {
        console.log('Fetching upcoming events...');

        const token = await this.getToken();

        const now = new Date();
        const timeMax = new Date(now.getTime() + hours * 60 * 60 * 1000);

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
            `timeMin=${now.toISOString()}&` +
            `timeMax=${timeMax.toISOString()}&` +
            `singleEvents=true&` +
            `orderBy=startTime`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to fetch events:', errorText);
            throw new Error('Failed to fetch upcoming events');
        }

        const data = await response.json();
        console.log('Upcoming events:', data.items?.length || 0);

        return data.items || [];
    }
}

export const googleCalendarService = new GoogleCalendarService();