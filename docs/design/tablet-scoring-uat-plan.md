# Tablet Scoring UI - User Acceptance Testing (UAT) Plan

## Document Information
- **Feature:** Tablet Scoring UI Enhancements
- **Status:** Draft - Pending Implementation
- **Created:** 2026-02-16
- **Version:** 1.0

## Test Environment
- **URL:** Preview environment (to be created via PR)
- **Test Devices:**
  - iPad (Safari, Chrome)
  - Android Tablet (Chrome)
  - Desktop Browser (Chrome, Firefox, Edge)
  - Laptop with Touch Screen

## Prerequisites
- Test user account with SSI access
- Test cup with active matches and squads
- Test data with existing scores in SSI
- Network connectivity for SSI API calls

---

## Test Scenarios

### 1. Fixed-Height Score Display

**Objective:** Verify that score display bars maintain consistent height and prevent layout shifts.

#### Test Case 1.1: Empty Score Track
- **Steps:**
  1. Navigate to tablet scoring UI
  2. Select a squad with no scores
  3. Observe the score track display
- **Expected Result:**
  - All string bars display with consistent height
  - Empty strings show placeholder content
  - No layout shifts or jumps

#### Test Case 1.2: Adding Scores
- **Steps:**
  1. Start with empty score track
  2. Add first score to string 1
  3. Add multiple scores to same string
  4. Switch to different string
  5. Observe layout stability
- **Expected Result:**
  - Score bars DO NOT change height when scores added
  - Layout remains stable throughout scoring session
  - Scrolling position maintained

#### Test Case 1.3: Full Score Track
- **Steps:**
  1. Fill all strings with maximum shots (13 per string)
  2. Scroll through all strings
  3. Compare heights across strings
- **Expected Result:**
  - All score bars maintain same height
  - No overflow or truncation
  - Consistent visual appearance

**Pass Criteria:** ✅ All score bars remain fixed height regardless of content

---

### 2. Navigation Breadcrumbs

**Objective:** Verify users can navigate back through scoring hierarchy.

#### Test Case 2.1: Breadcrumb Display
- **Steps:**
  1. Log in and select a cup
  2. Select a match
  3. Select a squad
  4. Observe breadcrumb navigation
- **Expected Result:**
  - Breadcrumbs show: `Cup Name > Match Name > Squad Name`
  - Current location (Squad) not clickable
  - Previous levels (Cup, Match) are clickable links

#### Test Case 2.2: Navigate to Match Selection
- **Steps:**
  1. While in scoring view, click "Cup Name" in breadcrumb
  2. Observe navigation
- **Expected Result:**
  - Returns to match selection screen for the cup
  - Scoring state preserved (if returning later)
  - No data loss

#### Test Case 2.3: Navigate to Squad Selection
- **Steps:**
  1. While in scoring view, click "Match Name" in breadcrumb
  2. Observe navigation
- **Expected Result:**
  - Returns to squad selection screen for the match
  - Can select different squad
  - Warning if unsaved scores exist

#### Test Case 2.4: Change Squad Button
- **Steps:**
  1. While scoring, click "Change Squad" button in header
  2. Select different squad
  3. Return to original squad
- **Expected Result:**
  - Quick access to squad selection
  - Saves current scores before switching
  - Loads new squad data correctly

**Pass Criteria:** ✅ All navigation paths work without data loss

---

### 3. User Info Display

**Objective:** Verify user information is visible and logout works.

#### Test Case 3.1: User Info Display
- **Steps:**
  1. Log in to tablet scoring UI
  2. Observe top-right corner of header
- **Expected Result:**
  - User email/name displayed in top-right
  - Text color: blue-200
  - Font size: small (sm)
  - Logout button visible next to email

#### Test Case 3.2: Logout Functionality
- **Steps:**
  1. Click logout button in header
  2. Observe result
- **Expected Result:**
  - Returns to login screen
  - Session terminated
  - Credentials cleared (if "Remember me" not checked)
  - No unsaved data lost warning if scores exist

#### Test Case 3.3: Responsive User Info
- **Steps:**
  1. Test on different screen sizes
  2. Test in portrait and landscape
- **Expected Result:**
  - User info visible on all screen sizes
  - Text truncates gracefully if email too long
  - Logout button always accessible

**Pass Criteria:** ✅ User info always visible with working logout

---

### 4. Touch-Friendly Score Deletion

**Objective:** Verify long-press score deletion works intuitively.

#### Test Case 4.1: Long-Press to Delete
- **Steps:**
  1. Add several scores to a string
  2. Long-press (hold for 750ms) on a score button
  3. Observe feedback and result
- **Expected Result:**
  - Visual feedback during long-press (progress animation)
  - Score deleted after 750ms hold
  - Toast notification: "Score deleted"
  - No delete button needed

#### Test Case 4.2: Short Press (No Delete)
- **Steps:**
  1. Short tap (< 750ms) on a score button
  2. Observe result
- **Expected Result:**
  - Score NOT deleted
  - No visual feedback after release
  - Normal score selection behavior

#### Test Case 4.3: Cancel Long-Press
- **Steps:**
  1. Start long-press on score
  2. Release before 750ms completes
  3. Observe result
- **Expected Result:**
  - Delete cancelled
  - No score removed
  - Progress animation stops

#### Test Case 4.4: Multiple Deletions
- **Steps:**
  1. Long-press delete first score
  2. Long-press delete second score
  3. Continue until string empty
- **Expected Result:**
  - Each deletion works independently
  - UI updates correctly after each delete
  - No rendering errors

#### Test Case 4.5: Touch vs Mouse
- **Steps:**
  1. Test long-press with touch (tablet)
  2. Test long-press with mouse (desktop)
- **Expected Result:**
  - Works with both touch and mouse input
  - Same visual feedback
  - Same 750ms timing

**Pass Criteria:** ✅ Long-press deletion works reliably across input methods

---

### 5. Responsive Scaling

**Objective:** Verify UI scales appropriately across different devices and orientations.

#### Test Case 5.1: Small Tablet (768px-1024px)
- **Steps:**
  1. Test on iPad Mini or similar (768px width)
  2. Test in portrait orientation
  3. Test in landscape orientation
- **Expected Result:**
  - All UI elements visible
  - Touch targets minimum 44x44px
  - Text readable (not too small)
  - Three-column layout functional

#### Test Case 5.2: Large Tablet (1024px-1366px)
- **Steps:**
  1. Test on iPad Pro or similar (1024px+ width)
  2. Test in both orientations
- **Expected Result:**
  - UI scales up appropriately
  - No wasted white space
  - Larger touch targets for easier interaction
  - Optimal use of screen real estate

#### Test Case 5.3: Desktop (1366px+)
- **Steps:**
  1. Test on desktop browser
  2. Test window resizing
- **Expected Result:**
  - UI remains functional
  - Maximum width constraints applied
  - Centered layout on large screens

#### Test Case 5.4: Touch Target Sizes
- **Steps:**
  1. Measure tap targets on all devices
  2. Test with finger/stylus
- **Expected Result:**
  - All buttons minimum 44x44px
  - Easy to tap without errors
  - Adequate spacing between buttons

#### Test Case 5.5: Font Scaling
- **Steps:**
  1. Check text sizes across devices
  2. Test with device accessibility settings (larger text)
- **Expected Result:**
  - Text uses rem units
  - Scales with browser/device settings
  - Always readable

**Pass Criteria:** ✅ UI works well on all supported device sizes

---

## Integration Testing

### End-to-End Scoring Flow
- **Steps:**
  1. Log in to tablet scoring UI
  2. Navigate through breadcrumbs (Cup → Match → Squad)
  3. Score multiple shooters with various scores
  4. Use long-press to delete and correct scores
  5. Save scores to SSI
  6. Verify scores in SSI web interface
  7. Navigate back and select different squad
  8. Log out
- **Expected Result:**
  - Complete flow works without errors
  - All scores saved correctly to SSI
  - Navigation smooth and intuitive
  - No data loss or corruption

### Cross-Device Consistency
- **Steps:**
  1. Start scoring on iPad
  2. Switch to Android tablet mid-session
  3. Complete scoring on desktop
- **Expected Result:**
  - Consistent behavior across devices
  - Same UI patterns
  - Data synchronized via SSI

---

## Regression Testing

Verify existing functionality still works:

### Existing Features to Test
- [ ] Score entry via number pad
- [ ] String color coding
- [ ] Shooter list and selection
- [ ] Auto-save on shooter switch
- [ ] Manual save button
- [ ] Score display in scrollable track
- [ ] Drag-and-drop shooter reordering
- [ ] Session management
- [ ] Error handling and retry

**Pass Criteria:** ✅ No regression in existing functionality

---

## Performance Testing

### Load Time
- **Test:** Measure page load time on various devices
- **Expected:** < 2 seconds on broadband, < 5 seconds on 3G

### Scroll Performance
- **Test:** Scroll through full score track with 78 shots
- **Expected:** Smooth 60fps scrolling, no jank

### Touch Response
- **Test:** Tap score buttons rapidly
- **Expected:** Immediate visual feedback (< 100ms)

---

## Accessibility Testing

### Keyboard Navigation
- [ ] Tab through all interactive elements
- [ ] Enter/Space to activate buttons
- [ ] Breadcrumb navigation keyboard accessible

### Screen Reader
- [ ] Test with VoiceOver (iOS)
- [ ] Test with TalkBack (Android)
- [ ] All buttons have clear labels

### Color Contrast
- [ ] Verify WCAG AA compliance
- [ ] Test with color blindness simulator

---

## Sign-Off

### Test Execution
- **Tested By:** _______________
- **Date:** _______________
- **Environment:** _______________
- **Device(s):** _______________

### Results
- **Total Test Cases:** 25
- **Passed:** ___
- **Failed:** ___
- **Blocked:** ___
- **Not Tested:** ___

### Issues Found
| ID | Description | Severity | Status |
|----|-------------|----------|--------|
|    |             |          |        |

### Approval
- **Product Owner:** _______________ Date: _______________
- **Development Lead:** _______________ Date: _______________

---

## Notes

### Known Limitations
- Long-press may conflict with browser text selection on some devices
- Breadcrumb text may truncate on very small screens
- Touch target size may need adjustment based on user feedback

### Future Enhancements
- Customizable long-press duration (500ms-1000ms)
- Undo/redo functionality for score deletions
- Keyboard shortcuts for desktop users
- Offline mode with sync when reconnected

---

## Appendix: Test Data

### Test Accounts
- **User 1:** test-scorer@example.com
- **User 2:** admin-scorer@example.com

### Test Cups
- **Cup 1:** TurRes Kupittaa CUP 14.02.2026
- **Cup 2:** TurRes Kupittaa CUP 21.02.2026

### Test Squads
- **Squad 1:** Laina-aseet (4 shooters)
- **Squad 2:** Veteran (6 shooters)

---

*Document prepared for UAT of tablet scoring UI enhancements. Update status upon completion of each test phase.*
