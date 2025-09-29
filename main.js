// main.js — improved and hardened for WanderShare
console.log("🚀 main.js is running");

const SUPABASE_URL = "https://qnphvvpvhqjlcztqhddt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFucGh2dnB2aHFqbGN6dHFoZGR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5ODM5NDEsImV4cCI6MjA3NDU1OTk0MX0.b3aF1NddQYr4_-TE3cxPGygRq4CRS5a1-_MbohqOcew";
const API_BASE = "https://wanders-api.onrender.com";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI elements
const authBtn = document.getElementById("authBtn");
const signUpBtn = document.getElementById("signUpBtn");
const signOutBtn = document.getElementById("signOutBtn");
const userGreeting = document.getElementById("userGreeting");
const statusEl = document.getElementById("status");
const feedEl = document.getElementById("feed");
const galleryEl = document.getElementById("gallery");
const shareForm = document.getElementById("shareForm");
const postTpl = document.getElementById("postTpl");

// Modal elements
const authModal = document.getElementById("authModal");
const modalTitle = document.getElementById("modalTitle");
const authForm = document.getElementById("authForm");
const modalEmail = document.getElementById("modalEmail");
const modalPassword = document.getElementById("modalPassword");
const modalMessage = document.getElementById("modalMessage");
const closeModal = document.getElementById("closeModal");
const clearBtn = document.getElementById("clearBtn");
const postBtn = document.getElementById("postBtn");

let currentUser = null;
let isSignup = false;

function setStatus(msg = "", color = "") {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = color || "";
}

function showModal(signup = false) {
  isSignup = signup;
  if (modalTitle) modalTitle.textContent = signup ? "Sign Up" : "Sign In";
  if (modalMessage) modalMessage.textContent = "";
  if (modalEmail) modalEmail.value = "";
  if (modalPassword) modalPassword.value = "";
  authModal?.classList.remove("hidden");
}

function hideModal() {
  authModal?.classList.add("hidden");
}

async function refreshUser() {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session ?? null;
    currentUser = session ? session.user : null;
    if (currentUser) {
      userGreeting.textContent = `Hello, ${currentUser.user_metadata?.full_name || currentUser.email.split("@")[0]}`;
      if (authBtn) authBtn.hidden = true;
      if (signUpBtn) signUpBtn.hidden = true;
      if (signOutBtn) signOutBtn.hidden = false;
    } else {
      userGreeting.textContent = "Welcome";
      if (authBtn) authBtn.hidden = false;
      if (signUpBtn) signUpBtn.hidden = false;
      if (signOutBtn) signOutBtn.hidden = true;
    }
  } catch (err) {
    console.error("refreshUser error:", err);
  }
}

// Open/close modal handlers
authBtn?.addEventListener("click", () => showModal(false));
signUpBtn?.addEventListener("click", () => showModal(true));
closeModal?.addEventListener("click", hideModal);

// Ensure authForm exists before wiring
if (!authForm) {
  console.warn("⚠️ authForm not found");
} else {
  console.log("✅ authForm found");

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!modalEmail || !modalPassword || !modalMessage) return;

    const email = (modalEmail.value || "").trim();
    const password = (modalPassword.value || "").trim();
    modalMessage.textContent = "";

    if (!email || !password) {
      modalMessage.textContent = "Email and password required";
      return;
    }

    modalMessage.textContent = isSignup ? "Signing up..." : "Signing in...";
    console.log("🔐 Attempting auth for:", email, "isSignup:", isSignup);

    try {
      // Use appropriate supabase auth calls
      const action = isSignup
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });

      const { data, error } = await action;
      console.log("✅ Supabase response:", { data, error });

      if (error) {
        modalMessage.textContent = error.message || "Authentication error";
        return;
      }

      // For sign-in ensure session exists
      if (!isSignup && !data?.session) {
        modalMessage.textContent = "Sign-in failed: No session returned";
        return;
      }

      modalMessage.textContent = isSignup
        ? "Signup successful! Check your email to confirm."
        : "Signed in successfully!";

      // Notify backend (non-sensitive: only email here; avoid sending password unless backend requires it)
      try {
        const resp = await fetch(`${API_BASE}/api/signin`, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ email })
        });

        const result = await resp.json().catch(() => ({}));
        console.log("✅ Backend sign-in response:", result);
        if (!resp.ok) {
          console.warn("⚠️ Backend sign-in returned non-OK:", result);
        }
      } catch (err) {
        console.error("❌ Error calling backend /api/signin:", err);
      }

      hideModal();
      await refreshUser();
    } catch (err) {
      console.error("Unexpected auth error:", err);
      modalMessage.textContent = "Something went wrong. Try again.";
    }
  });
}

// Sign out
signOutBtn?.addEventListener("click", async () => {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Sign out error:", err);
  } finally {
    await refreshUser();
  }
});

// Subscribe to auth changes and refresh on load
const { data: authSub } = supabase.auth.onAuthStateChange((_event, _session) => refreshUser());
refreshUser();

// Load posts
async function loadPosts() {
  setStatus("Loading posts...");
  try {
    const res = await fetch(`${API_BASE}/api/posts?limit=40`);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.warn("Load posts non-OK:", errBody);
      setStatus("Failed to load posts", "red");
      feedEl.innerHTML = '<div class="card">Failed to load posts.</div>';
      return;
    }
    const json = await res.json();
    renderPosts(json.posts || []);
    setStatus("");
  } catch (err) {
    console.error("Fetch error:", err);
    setStatus("Failed to load posts", "red");
    feedEl.innerHTML = '<div class="card">Network error loading posts.</div>';
  }
}

function sanitizeText(s) {
  return String(s ?? "");
}

function renderPosts(posts) {
  if (!feedEl || !postTpl) return;
  feedEl.innerHTML = "";
  if (!posts.length) {
    feedEl.innerHTML = '<div class="card">No posts yet.</div>';
    galleryEl.innerHTML = "";
    return;
  }

  posts.forEach(p => {
    const node = postTpl.content.cloneNode(true);
    const imgEl = node.querySelector(".post-image");
    const titleEl = node.querySelector(".post-title");
    const textEl = node.querySelector(".post-text");
    const placeEl = node.querySelector(".place");
    const authorEl = node.querySelector(".author");
    const dateEl = node.querySelector(".date");

    if (imgEl) imgEl.src = sanitizeText(p.image_url) || "";
    if (titleEl) titleEl.textContent = sanitizeText(p.title);
    if (textEl) textEl.textContent = sanitizeText(p.story);
    if (placeEl) placeEl.textContent = sanitizeText(p.location);
    if (authorEl) authorEl.textContent = `— ${sanitizeText(p.author_display_name || "Anonymous")}`;
    if (dateEl) {
      dateEl.textContent = p.created_at ? new Date(p.created_at).toLocaleString() : "";
    }

    feedEl.appendChild(node);
  });

  // Gallery thumbnails (first 12 with images)
  galleryEl.innerHTML = "";
  posts.filter(p => p.image_url).slice(0, 12).forEach(p => {
    const fig = document.createElement("figure");
    fig.className = "g-thumb";
    const img = document.createElement("img");
    img.src = sanitizeText(p.image_url);
    img.alt = sanitizeText(p.title) || "Post image";
    fig.appendChild(img);
    galleryEl.appendChild(fig);
  });
}

// Handle share form submission
shareForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!shareForm) return;

  setStatus("Preparing post...");

  // require auth
  const sessionData = await supabase.auth.getSession().catch(err => {
    console.error("getSession error:", err);
    return { data: { session: null } };
  });
  const token = sessionData.data.session?.access_token;
  if (!token) {
    setStatus("Sign in to post", "red");
    return;
  }

  const title = (document.getElementById("title")?.value || "").trim();
  const location = (document.getElementById("location")?.value || "").trim();
  const story = (document.getElementById("story")?.value || "").trim();
  const file = (document.getElementById("image")?.files || [])[0];

  if (!title || !story || title.length > 200 || story.length > 2000) {
    setStatus("Title and story required (within limits)", "red");
    return;
  }

  const form = new FormData();
  form.append("title", title);
  form.append("story", story);
  form.append("location", location);
  if (file) form.append("image", file);

  setStatus("Uploading…");

  try {
    const resp = await fetch(`${API_BASE}/api/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("Post failed:", json);
      setStatus(json.error || "Post failed", "red");
      return;
    }

    setStatus("Posted successfully", "green");
    shareForm.reset();
    await loadPosts();
  } catch (err) {
    console.error("Post error:", err);
    setStatus("Post error", "red");
  } finally {
    if (postBtn) postBtn.disabled = false;
  }
});

// Clear form
clearBtn?.addEventListener("click", () => {
  shareForm?.reset();
  setStatus("");
});

// Initial load
loadPosts();

// Clean up auth subscription on unload (Supabase returns subscription object in authSub)
if (authSub && typeof authSub.unsubscribe === "function") {
  window.addEventListener("beforeunload", () => {
    try { authSub.unsubscribe(); } catch (e) { /* ignore */ }
  });
}