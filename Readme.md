# Testing Guide for PresentLive

PresentLive is an interactive presentation platform where presenters create slides using the presentMD format.
Presentations can be shared with attendees via a unique link/QR code.
Attendees can view the content and respond to polls directly on their own devices.
Once completed, the results are sent back to the presenter;
attendees cannot edit their responses but can review them.
Presenters can use AI to summarize the results in 1-3 sentences for a quick overview of the information.

## Install and Run

1. Unzip and open the terminal in the `presentlive-app` folder
2. Run `npm install` (installs everything listed in `package.json`)
3. Run `npm run dev`
4. Open the local URL shown in the terminal (usually `http://localhost:5173`)

Packages used (already listed in `package.json`, installed automatically by step 2):
`react-router-dom`, `@mantine/core`, `@mantine/hooks`, `@mantine/form`, `@tabler/icons-react`, `qrcode.react`

## Workflow 1: Presenter — Presentation management

1. Start at the home screen. If no presentations exist yet, a welcome modal appears - click **"+ New Presentation"** to begin.
2. You are taken to the Edit page. Fill in **Title**, **Description**, **Presenter Name**, and click **Save**.
3. Keep **Status** as "Draft" while editing; only switch to "Published" once ready for attendees to join.
4. Click **"Add Slide"** to create a slide. Enter a **Title**, choose **Type** ("Content" or "Poll"):
   - For a **Content** slide, write presentMD markdown in the Body field (live preview shown on the right).
   - For a **Poll** slide, also fill in **Question** and **Options** (comma-separated).
   - For background color, use this format: <!-- backgroundColor: #ffcc00 -->
5. Click **"Copy Link"** or scan the **QR code** shown on the Edit page to get the attendee link.
6. After attendees join and respond (see Workflow 2), scroll down on the Edit page to see:
   - The list of **Attendees** and their status (Viewing / Finished).
   - **Poll Results** with live percentage bars for each poll slide.
   - Click **"Summarize with AI"** on any poll to get a short AI-generated summary of the responses.
   - Click **"View Details"** next to Attendees to open `PollResponses.jsx`, showing each attendee's individual answers.

## Workflow 2: Attendee — Presentation view and responses

1. Open the presentation link (from Copy Link or QR code) in a new browser tab or on a separate device. No login is required.
2. If the presentation is still "Draft", a message is shown instead of the presentation. Publish it first (Workflow 1, step 3).
3. On the Welcome screen, enter a display name and click **"Join Presentation"**.
4. Step through the presentation one slide at a time using **"Next"**. You cannot go back to a previous slide.
5. On a Poll slide, select one option and click **"Submit Answer"** before "Next" becomes available. Once submitted, the answer cannot be changed.
6. After the last slide, a "Thank you" screen appears. Click **"Review Slides"** to browse back through the presentation content (read-only — poll answers already given cannot be changed).
7. Closing the tab and reopening the same link resumes from the same slide (progress is saved via the API), rather than restarting from the beginning.

## Where each Functionality requirement is demonstrated

**1. App Design and Navigation** - Consistent Header and Footer for presenter mode, with repeated color themes.
**2. A Multi-entity Data Structure** - 4 entities: `presentations`, `slides`, `attendees`, `poll_responses`, all via the provided RESTful API.
**3. Data Collection and Interaction** - Responses from attendees are displaying in both percentages and numbers for presenter. It can be used later for AI Summary.
**4. User Stories/Workflows** - Two distinctive workflow for both presenter and attendee. For the attendee's workflow, they follw a one-step per page, which means
they cannot skipped before completing the task. Furthermore, only review is allowed after finishing their responses.
**5. Unique Link Access** - "Copy Link" button on the Edit page; paste the link into a fresh incognito window to confirm it works with no login.
**6. AI Integration** - "Summarize with AI" button next to any Poll Result on the Edit page (Workflow 1, step 6).
**7. Advanced Features** - QR code shown on the Edit page, generated from the unique presentation link.

## Sample Data

To fully test both workflows without creating everything from scratch, add the following via the app itself:
_The data was taken from Assignment 1 (04-complete-deck.md)_

**Presentation**

- Title: `Riverside Library Redevelopment`
- Description: `Q3 planning session for the new community library.`
- Presenter Name: `Alex Chen`
- Status: `Published` (required for the attendee link to work)

**Slide 1 (Content)**

- Title: `Overview`
- Body: `The build is **on schedule** and _slightly_ under budget.`

**Slide 2 (Poll)**

- Title: `Layout Preference`
- Question: `Which layout do you prefer?`
- Options: `Open plan, Quiet zones, Mixed`

After publishing, open the presentation link as an attendee, join with any display name, answer the poll, and finish - then return to the Edit page to see the attendee, their response, and the AI summary.
**For presenter - Please reload the page if the data has not been recorded.**

## Limitations

1. **Poll response** -- When adding or changing a "Content" slide in a presentation into a Poll, an attendee who has already completed the presentation cannot go back to answer the newly added poll.
2. **Long content display** -- PresentLive does not paginate very long slide bodies; the content scrolls vertically instead, so an attendee may need to scroll/zoom out rather than seeing everything at once.

## Code Inspiration

`presentMDparser.js` was taken from Assignment 1 with minimal modification at the end:

```js
export { parsePresentMD, parseInline, nest };
```

(changed from the original `module.exports` CommonJS syntax to an ES module export, so it can be imported into the React app.)

This `Readme.md` template was taken from the Week 8 Applied Class.

## AI Acknowledgement

Most UI elements were designed by the student, except the AI integration design on the `HostEdit.jsx` page, which relied mostly on AI assistance.

Pages primarily written by the student, with general support from AI:

- `Header.jsx`
- `Footer.jsx`
- `api.js` (the first `apiGet` function was given by AI; other functions were adapted from it)
- `Home.jsx`
- `PollResponses.jsx`
- `App.jsx`
- `App.css`

Pages/sections primarily supported by AI:

- `PollResponses.jsx` - data fetching logic
- `HostEdit.jsx`
- `PresentationView.jsx`
- `aiApi.js`
- `presentMDRenderer.jsx` - functions `renderBlock`, `extractSlideStyle`
