// server.js (or app.js)
import express from 'express';
import cors from 'cors';
import SpotifyWebApi from 'spotify-web-api-node';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors({
  origin: 'https://frontend-spotify-mu.vercel.app',
  methods: ['GET', 'PUT']
}));

app.use(express.json());

// Spotify API setup
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI, // e.g., https://yourportfolio.com/spotify/callback
});

// Middleware to refresh access token if expired
const refreshAccessToken = async () => {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body.access_token);
    // Optionally store in DB or env
  } catch (error) {
    console.error('Error refreshing token:', error);
  }
};

// Auth route: Redirect to Spotify for authorization
app.get('/spotify/auth', (req, res) => {
  const scopes = ['user-top-read', 'user-read-currently-playing', 'user-modify-playback-state'];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes);
  res.redirect(authorizeURL);
});

// Callback route: Exchange code for tokens
app.get('/spotify/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    spotifyApi.setAccessToken(data.body.access_token);
    spotifyApi.setRefreshToken(data.body.refresh_token);
    // Store tokens securely (e.g., in MongoDB or env for demo)
    // For demo, assume env vars are updated manually or via DB
    res.json({ message: 'Authenticated! You can now use /spotify.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /spotify: Return top 10 tracks and now playing as JSON
app.get('/spotify', async (req, res) => {
       try {
         await refreshAccessToken(); // Ensure token is fresh
         const [topTracksRes, nowPlayingRes] = await Promise.all([
           spotifyApi.getMyTopTracks({ limit: 10 }),
           spotifyApi.getMyCurrentPlayingTrack(),
         ]);
         const topTracks = topTracksRes.body.items.map(track => ({
           id: track.id,
           name: track.name,
           artist: track.artists[0].name,
           uri: track.uri,
         }));
         // Updated: Check for body AND item to avoid errors
         const nowPlaying = (nowPlayingRes.body && nowPlayingRes.body.item) ? {
           name: nowPlayingRes.body.item.name,
           artist: nowPlayingRes.body.item.artists[0].name,
           isPlaying: nowPlayingRes.body.is_playing,
         } : null;
         res.json({
           topTracks,
           nowPlaying,
           actions: {
             pause: 'PUT /spotify/pause',
             play: 'PUT /spotify/play/{trackId} (replace {trackId} with a track ID from topTracks)',
           },
         });
       } catch (error) {
         res.status(500).json({ error: error.message });
       }
     });

// PUT /spotify/pause: Stop the currently playing song
app.put('/spotify/pause', async (req, res) => {
  try {
    await refreshAccessToken();
    await spotifyApi.pause();
    res.json({ message: 'Playback paused.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /spotify/play/:trackId: Start playing a top track
app.put('/spotify/play/:trackId', async (req, res) => {
  try {
    await refreshAccessToken();
    const track = await spotifyApi.getTrack(req.params.trackId);
    await spotifyApi.play({ uris: [track.body.uri] });
    res.json({ message: `Playing: ${track.body.name}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));