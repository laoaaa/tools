# Lain Quotes Website with Animated GIF and Audio

A static website featuring an animated Lain GIF that displays random quotes when clicked, with looping background audio.

## Features
- Black background with centered animated Lain GIF
- Click the GIF to get a random quote from Serial Experiments Lain
- Background audio loops continuously (starts on first interaction due to browser policies)
- Responsive design that works on desktop and mobile

## How to Replace with Your Video

### Step 1: Convert Your Video
Since you're using an iPhone, you can use online tools:

**For GIF conversion:**
- Go to https://ezgif.com/video-to-gif
- Upload your `2611562755.mov` file
- Set dimensions to max 320px width for optimal loading
- Download the resulting GIF

**For Audio extraction:**
- Go to https://audio-extractor.net/
- Upload your video file
- Extract and download the MP3 audio

### Step 2: Replace Files
1. Replace `lain-placeholder.gif` with your converted GIF (rename it to `lain-placeholder.gif`)
2. Replace `lain-audio.mp3` with your extracted audio (rename it to `lain-audio.mp3`)

### Step 3: Deploy to GitHub Pages
1. Create a GitHub account at https://github.com/
2. Create a new repository named `your-username.github.io`
3. Upload all files from this folder to your repository
4. Your site will be available at `https://your-username.github.io`

## Notes
- Modern browsers block autoplay audio, so background music starts on first user interaction (click/hover)
- The GIF is displayed as a circle with subtle hover effects
- Quotes appear above the GIF and fade out after 3 seconds
- All files are optimized for fast loading