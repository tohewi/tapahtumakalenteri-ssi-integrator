# Tablet Scoring UI

This document describes the tablet scoring interface implementation for the SSI Tools scoring application.

## Overview

The tablet scoring UI is an alternative interface optimized for tablets, laptops, and larger screens. It provides a more efficient scoring workflow by displaying all key elements simultaneously:

- **Left panel**: Shooter list with drag-and-drop reordering
- **Center panel**: Scrollable score track showing all entered scores
- **Right panel**: Number pad for quick score entry
- **Top bar**: Match info, squad info, and scoring statistics

## Features

### 1. Three-Column Layout

The interface uses a responsive three-column layout that adapts to different screen sizes:
- On desktop/tablet (≥1024px): Three columns side-by-side
- On mobile (<1024px): Stacked layout with all functionality preserved

### 2. Shooter Selection and Reordering

**Left Panel Features:**
- List of all shooters in the squad
- Visual indication of selected shooter (blue highlight)
- Score summary for each shooter (points and hits)
- **Drag-and-drop reordering**: Shooters can be reordered to match their physical track positions
- Click any shooter to load their scores

### 3. Score Track (Center Panel)

The score track displays all entered scores organized by strings:
- Each string has a different background color for easy visual separation
- Scores are displayed as individual shot buttons
- Click any score to select it for editing/removal
- Selected scores are highlighted with a blue border
- Auto-scrolls to bottom when new scores are added
- Shows hit count per string (e.g., "5 / 5")

**String Colors:**
- String 1: Blue
- String 2: Green
- String 3: Purple
- String 4: Amber
- String 5: Rose
- String 6: Teal

### 4. Number Pad (Right Panel)

Quick score entry interface:
- Large buttons for all score zones: X, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, M
- Color-coded:
  - High scores (X, 10): Blue
  - Mid scores (9-2): Gray
  - Miss (M): Red
- Click to add score to current string
- If a score is selected in the track, a "Remove" button appears

### 5. Top Bar Statistics

Real-time scoring statistics:
- **Shooter name**: Currently selected shooter
- **Shots fired**: Number of shots entered vs. total shots in match
- **Total points**: Current point total
- **X-count**: Number of X (bullseye) hits

### 6. Local Storage and SSI Sync

**Auto-save:**
- Scores are automatically saved to browser localStorage when modified
- Switching shooters triggers automatic save

**SSI Integration:**
- When selecting a shooter, their scores are loaded from SSI
- If local scores differ from SSI, a merge conflict dialog appears
- User can choose to keep local scores or SSI scores

**Error Handling:**
- Save errors display a notification with retry button
- Load errors display a notification with retry button
- If SSI is unavailable, scores are saved locally only

### 7. Workflow

**Standard Usage:**
1. Login with SSI credentials
2. Search and select cup
3. Select match
4. Select squad
5. **Tablet Scoring Interface loads:**
   - Select shooter from left panel
   - Enter scores using number pad
   - Click individual scores to edit/remove them
   - Click "Save Scores" to sync to SSI
   - Switch to next shooter (auto-saves current shooter)
6. Repeat until all shooters are scored

**Drag-and-Drop Reordering:**
1. Click and hold on a shooter in the left panel
2. Drag to desired position
3. Drop to reorder
4. Order is preserved in the UI session

## Technical Implementation

### Files Created/Modified

**New Files:**
- `scoring-ui/src/TabletApp.jsx` - Main app component for tablet scoring
- `scoring-ui/src/components/TabletScoringView.jsx` - Tablet scoring interface

**Modified Files:**
- `scoring-ui/src/main.jsx` - Added routing for `#/scoring-tablet`
- `scoring-ui/src/components/HomePage.jsx` - Added tablet scoring option
- `scoring-ui/src/i18n.js` - Added translations for tablet UI (Finnish and English)

### State Management

**TabletApp State:**
- `view`: Current view (login, cup, match, squad, scoring)
- `selectedCup`: Currently selected cup
- `matches`: List of matches in the cup
- `selectedMatch`: Currently selected match
- `selectedSquad`: Currently selected squad
- `allScores`: Object containing scores for all shooters in the squad
- Navigation state saved to localStorage for session restoration

**TabletScoringView State:**
- `selectedShooter`: Currently selected shooter
- `selectedScoreIndex`: Currently selected score for editing (seriesIdx, zone, hitIdx)
- `saving`: Save operation in progress
- `saveError`: Error from last save attempt
- `loadError`: Error from last load attempt
- `showMergeConflict`: Whether merge conflict dialog is visible
- `mergeData`: Local vs SSI scores for merge resolution
- `draggedShooter`: Shooter being dragged (for reordering)

### localStorage Keys

- `ssi_tablet_scores` - Scores for all shooters in format `{matchId_squadId: {shooterId: scores}}`
- `ssi_tablet_nav_state` - Navigation state for session restoration
- `ssi_credentials_tablet` - Encrypted credentials (if "Remember me" is checked)
- `ssi_last_cup` - Last selected cup

### API Integration

Reuses existing API methods from `scoring-ui/src/api.js`:
- `login()` - Authenticate with SSI
- `getCup()` - Load cup data
- `getMatch()` - Load match with squads
- `getCompetitor()` - Load shooter scores from SSI
- `submitScore()` - Save scores to SSI

### Score Format

Scores are stored as objects:
```javascript
{
  0: { X: 1, '10': 2, '9': 1, '8': 1, '7': 0, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, M: 0 },
  1: { X: 0, '10': 1, '9': 2, '8': 1, '7': 1, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, M: 0 },
  // ... strings 2-5
}
```

Each string (0-5) contains counts for each score zone.

## Design Decisions

1. **Separate localStorage keys**: Tablet UI uses separate keys from mobile UI to avoid conflicts
2. **Reuse components**: Login, Cup Search, Match Picker, and Squad Picker are shared with mobile UI
3. **Color scheme**: Matches existing mobile UI color scheme
4. **Responsive design**: Uses Tailwind CSS breakpoints (lg:) for responsive behavior
5. **Error resilience**: Graceful handling of SSI unavailability with local-only mode

## Future Enhancements

Potential improvements not in initial implementation:
- Bulk score entry mode
- Score history/undo functionality
- Keyboard shortcuts for score entry
- Statistics view per shooter
- Export scores to CSV
- Offline mode with queue-based sync
