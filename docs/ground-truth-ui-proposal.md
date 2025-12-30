# Ground Truth Correction UI - Detailed Proposal

## Overview
Add ground truth classification and correction features directly into the existing `SuggestionCard` component.

---

## Feature 1: Ground Truth Button ⭐

**Location**: Bottom action bar, next to Deny/Add/Edit buttons

**Behavior**:
```
When clicked:
1. Save finding to Firestore: collection=`ground_truth_examples`
2. Mark finding with visual badge: "Ground Truth ⭐"
3. This example will be injected into future AI prompts
```

**UI**:
```tsx
<button className="ground-truth-btn">
  <span className="material-symbols-outlined">star</span>
  Ground Truth
</button>
```

---

## Feature 2: Alternative Source Suggestion ✏️

**Problem**: AI found "אחד רוכב ואחד מנהיג" but cited **Mishnah Bava Metzia 1:1** (wrong)

**Solution**: Click "Suggest Alternative" → opens inline editor

**UI Flow**:
```
┌─────────────────────────────────────┐
│ Current: Mishnah Bava Metzia 1:1    │
│ [✏️ Suggest Alternative Source]     │
└─────────────────────────────────────┘

When clicked:
┌──────────────────────────────────────┐
│ Correct Source:                      │
│ ┌──────────────────────────────┐    │
│ │ Bavli Bava Metzia            │◄─── Autocomplete dropdown
│ └──────────────────────────────┘    │
│ Page: [8a]                           │
│ Reason: [Donkey acquisition case]    │
│ [Cancel] [Save as Correction]        │
└──────────────────────────────────────┘
```

**Backend**:
```javascript
// Save correction
{
  originalSource: "Mishnah Bava Metzia 1:1",
  correctSource: "Bavli Bava Metzia 8a",
  phrase: "אחד רוכב ואחד מנהיג",
  correctionReason: "Donkey acquisition case",
  isGroundTruth: true
}
```

---

## Feature 3: OCR Text Correction 📝

**Location**: Expandable section below the finding quote

**UI**:
```
┌───────────────────────────────────────┐
│ Quote: "בטבץ מרן"                     │
│ [📝 Fix OCR]                          │   ← Toggle button
└───────────────────────────────────────┘

When expanded:
┌─────────────────────────────────────────┐
│ Original OCR Text (editable):           │
│ ┌─────────────────────────────────────┐ │
│ │ בטבץ מרן                            │ │◄─ Hebrew text input
│ └─────────────────────────────────────┘ │
│ [Reanalyze with corrected text]         │
└─────────────────────────────────────────┘
```

**Behavior**:
1. User edits Hebrew text: "בטבץ מרן" → "כבני מרון"
2. Clicks "Reanalyze"
3. AI re-processes ONLY this snippet with corrected text
4. Updates the source reference

---

## Feature 4: Edit AI Justification ✍️

**Location**: Below "Analysis" section

**Problem**: AI explanation is wrong or incomplete

**UI**:
```
┌─────────────────────────────────────────┐
│ ANALYSIS                                │
│ The phrase "רשות היחיד" refers to...   │
│ [✍️ Edit Explanation]                   │
└─────────────────────────────────────────┘

When clicked:
┌─────────────────────────────────────────┐
│ Edit Explanation:                       │
│ ┌─────────────────────────────────────┐ │
│ │ The phrase is subversive, using     │ │◄─ Multiline textarea
│ │ Sabbath law terminology to describe │ │
│ │ individual autonomy...              │ │
│ └─────────────────────────────────────┘ │
│ [Cancel] [Save]                         │
└─────────────────────────────────────────┘
```

---

## Feature 5: Add New Reference Manually 

**Location**: Top of findings panel

**Existing Button**: "+ Add Reference" (already implemented in `AddReferenceModal`)

**Enhancement Needed**: 
- Add "Save as Ground Truth" checkbox in modal
- When checked, saves to `ground_truth_examples`

---

## Proposed UI Layout

```
┌──────────────────────────────────────────────────────────┐
│ Text Analyzer                     [+ Add Reference]       │
├──────────────────────────────────────────────────────────┤
│                     │                                     │
│  Hebrew Text        │  Findings Panel (scroll)            │
│  with highlights    │  ┌────────────────────────────┐    │
│                     │  │ "רשות היחיד"              │    │
│  רשות היחיד        │  │ ─────────────              │    │
│  [בעד הרבים]       │  │ ANALYSIS                   │    │
│                     │  │ Subversive usage...        │    │
│                     │  │ [✍️ Edit Explanation]      │    │
│                     │  │                            │    │
│                     │  │ REFERENCE                  │    │
│                     │  │ Bavli Shabbat 6a           │    │
│                     │  │ [✏️ Suggest Alternative]   │    │
│                     │  │                            │    │
│                     │  │ SOURCE COMPARISON          │    │
│                     │  │ [Hebrew + translation]     │    │
│                     │  │                            │    │
│                     │  │ [Deny] [Add] [⭐ GT] [✏️]  │    │
│                     │  └────────────────────────────┘    │
│                     │  ┌────────────────────────────┐    │
│                     │  │ "אחד רוכב ואחד מנהיג"     │    │
│                     │  │ ─────────────              │    │
│                     │  │ Quote: "שנים...רוכב"     │    │
│                     │  │ [📝 Fix OCR] ◄──Expanded  │    │
│                     │  │ ┌────────────────────┐    │    │
│                     │  │ │ שנים רוכב ואחד    │    │    │
│                     │  │ │ מנהיג              │    │    │
│                     │  │ └────────────────────┘    │    │
│                     │  │ [Reanalyze]               │    │
│                     │  │                            │    │
│                     │  │ Current: Mishnah BM 1:1    │    │
│                     │  │ [✏️ Suggest Alternative]   │    │
│                     │  │ ── Expanded ──            │    │
│                     │  │ Correct Source:            │    │
│                     │  │ [Bavli Bava Metzia ▼]      │    │
│                     │  │ Page: [8a]                 │    │
│                     │  │ [Save Correction]          │    │
│                     │  │                            │    │
│                     │  │ [Deny] [Add] [⭐ GT]       │    │
│                     │  └────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Step 1: Firestore Schema
```typescript
interface GroundTruthExample {
  id: string;
  phrase: string; // The Hebrew/text phrase
  correctSource: string; // "Bavli Bava Metzia 8a"
  originalSource?: string; // If this was a correction
  snippet: string; // Full quote from document
  justification?: string; // User-edited explanation
  action: 'APPROVE' | 'REJECT' | 'CORRECT';
  isGroundTruth: boolean;
  createdAt: Date;
  userId: string;
}
```

### Step 2: Update `SuggestionCard.tsx`
- Add Ground Truth button
- Add "Suggest Alternative" expandable section
- Add "Fix OCR" expandable section
- Add "Edit Explanation" inline editor

### Step 3: Update `TextAnalyzerView.tsx`
- Query `ground_truth_examples` before analysis
- Inject approved examples into AI prompt as few-shot training
- Inject REJECT examples into IGNORE list

### Step 4: Ground Truth Manager View (Optional)
- New page: `/ground-truth`
- Shows all corrections in a table
- Filter by: All / Approved / Rejected / Corrections
- Bulk export to MD file

---

## Questions for You

1. **Which features are most critical?**
   - ⭐ Ground Truth button
   - ✏️ Alternative source suggestion
   - 📝 OCR correction
   - ✍️ Edit justification

2. **Should corrections apply retroactively?**
   - When you correct "donkey → Bavli BM 8a", should the app:
     - Just save for future analyses? OR
     - Re-scan all existing texts and update?

3. **Where should the source dropdown get its data?**
   - Hardcoded list of tractates?
   - Autocomplete from Sefaria?
   - Your existing `tractate-mappings.ts`?

---

**Ready to implement?** Tell me which features to prioritize and I'll start building.
