// Load environment variables based on NODE_ENV
require('dotenv').config({
  path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development'
});

// Log environment status
console.log('Environment:', {
  NODE_ENV: process.env.NODE_ENV,
  hasStripeSecret: !!process.env.STRIPE_SECRET_KEY,
  hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
  frontendUrl: process.env.FRONTEND_URL
});

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const serviceAccount = require('./serviceAccount.json');

const app = express();

// Configure CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));

// This is your Stripe CLI webhook secret for testing your endpoint locally.
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!endpointSecret) {
  console.error('STRIPE_WEBHOOK_SECRET is not set!');
  process.exit(1);
}

// Initialize Firebase Admin
try {
  initializeApp({
    credential: require('firebase-admin/app').cert(serviceAccount)
  });

  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
  process.exit(1);
}

const db = getFirestore();

// Use raw body for Stripe webhooks
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (request, response) => {
  const sig = request.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const customerEmail = session.customer_details.email.toLowerCase();
      console.log('Processing webhook for email:', customerEmail);

      // Find user by email
      const usersSnapshot = await db.collection('users')
        .where('email', '==', customerEmail)
        .limit(1)
        .get();

      if (usersSnapshot.empty) {
        console.error(`No user found for email: ${customerEmail}`);
        response.status(400).send(`No user found for email: ${customerEmail}`);
        return;
      }

      const userDoc = usersSnapshot.docs[0];
      console.log('Found user document:', {
        email: userDoc.data().email,
        hasExistingLicense: !!userDoc.data().license?.active
      });

      // Update the user's license status
      try {
        await userDoc.ref.update({
          'license': {
            active: true,
            updatedAt: new Date().toISOString(),
            stripeSessionId: session.id
          }
        });
        console.log(`License activated successfully for user: ${userDoc.data().email}`);
      } catch (updateError) {
        console.error('Error updating license:', updateError);
        throw updateError;
      }

      response.json({ received: true });
    } catch (error) {
      console.error('Error processing webhook:', error);
      response.status(500).send(`Webhook Error: ${error.message}`);
    }
  } else {
    response.json({ received: true });
  }
});

// Create checkout session endpoint
app.post('/api/create-checkout-session', express.json(), async (req, res) => {
  const { email, returnUrl } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${returnUrl}/app`,
      cancel_url: returnUrl,
      automatic_tax: { enabled: true },
      customer_email: email
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});