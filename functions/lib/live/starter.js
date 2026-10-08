// The starter checklist templates (docs/specs/control-room.md §5): one list per beat. seed-live.js writes them to
// live/main/private/checklistTemplates the first time; after that they are the owner's to edit at /live/control/checklist.
// Item ids are fixed so a re-seed is a no-op. A "shortcut" runs a control and ticks itself when that control is used.
const STARTER_TEMPLATES = Object.freeze({
  beats: {
    start: [
      { id: "start-welcome", text: "Welcome chat, room by room" },
      { id: "start-word", text: "Say the word and open check-in", shortcut: "openCheckin" },
      { id: "start-games", text: "Tell chat tonight's games" },
      { id: "start-socials", text: "Socials", shortcut: "copySocials" },
      { id: "start-queue", text: "Point to the question queue" },
    ],
    break1: [
      { id: "break1-checkin", text: "Open check-in", shortcut: "openCheckin" },
      { id: "break1-questions", text: "Questions, 8 minutes", shortcut: "startQuestions" },
      { id: "break1-hydrate", text: "Hydrate" },
      { id: "break1-firstin", text: "Shout out the first-ins" },
    ],
    break2: [
      { id: "break2-checkin", text: "Open check-in", shortcut: "openCheckin" },
      { id: "break2-hotseat", text: "Hot Seat, 2 rounds", shortcut: "startHotSeat" },
      { id: "break2-schedule", text: "Plug the schedule" },
    ],
    end: [
      { id: "end-checkin", text: "Open check-in", shortcut: "openCheckin" },
      { id: "end-crew", text: "Thank the crew by name" },
      { id: "end-next", text: "Say when the next stream is" },
      { id: "end-aftershow", text: "After-show or goodbye", only: "platform" },
    ],
  },
});

module.exports = { STARTER_TEMPLATES };
