# Brain Dump: staging test plan

Already checked in headless Chromium on the mockups (Oct 17, 2026): 71 board checks and 42 How it works checks, all passing (behavior, undo, filters, drag by mouse, keyboard and simulated touch, reload, blocked storage, 390 px, print, reduced motion, focus, contrast). What's left needs real devices, real accounts and the real backend. Hard refresh (Ctrl+Shift+R) before each round.

## A. Access (staging)
1. Signed in as the owner: `/brain-dump` shows the board; the account menu has "Brain Dump".
2. A crew account: same.
3. @gbo (an admin): same.
4. A plain member (no crew role, no Sub Club): the lock card "Comes with Sub Club"; no account-menu item.
5. Signed out: the lock card opens the sign-in dialog.
6. `/brain-dump/how-it-works` signed out, as a plain member and as the owner: the closing buttons change (Join free / Sub Club line / Open my Brain Dump).

## B. Saving and sync
1. Add a goal, items in three cards, star one, check one. Hard refresh: everything is still there.
2. Open `/brain-dump` on your phone with the same account: the same board.
3. With both open, add an item on the phone: it appears on the PC within a few seconds (while you aren't typing on the PC).
4. Phone in airplane mode: add two items, close the tab, turn airplane mode off, open the page: both items are there and reach the PC.

## C. Privacy (rules)
1. Claude Code's rules test (or the emulator check it reports) passes: another signed-in user cannot read or write your board; an account without access cannot read or write its own.

## D. Real phones (iPhone Safari and Android Chrome)
1. Move to… on an Inbox item: the native picker lists every category, including one you just added or renamed.
2. Drag a card by its dots with your finger; the page scrolls when you drag near the bottom; the order stays after a refresh.
3. ▲ ▼ ☆ ✕ are easy to hit; nothing is hidden behind hover.
4. Undo after deleting an item, then after Clear checked.
5. How it works: the chip row sticks, tapping a stage card plays its scene, the practice board works and doesn't change your real board.

## E. Print
1. Print `/brain-dump` (or save as PDF): white page, two columns, light colored cards, no buttons.
