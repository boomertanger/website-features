// Installs Chat Games' entry point (shared/ui/chatgames.js, docs/specs/chat-games.md §3) with the site's callable, toast and mascot.
// Loaded by /live/control, /live/deck and /live; /live/obs uses the shared module directly (it only mounts scenes).
import { initChatGames } from "../../../../shared/ui/chatgames.js";
import { call } from "../../lib/call";
import { toast, mascotHtml } from "./ui";
import "./cg-questions";   // the Questions format (part 2): launch dialog, Play panel, stream view scene

export const chatGames = initChatGames({ call, toast, mascotHtml });
