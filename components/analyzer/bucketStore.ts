"use client";

import { useSyncExternalStore } from "react";
import { BUCKET_STORAGE_KEY, EMPTY_BUCKET_DATA, parseBucketData, type BucketData } from "@/lib/analyze/bucketlist";

interface StoreState {
  ready: boolean;
  data: BucketData;
  error: string | null;
  blocked: boolean;
}

const initial: StoreState = { ready: false, data: EMPTY_BUCKET_DATA, error: null, blocked: false };
let state = initial;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function load() {
  try {
    const saved = localStorage.getItem(BUCKET_STORAGE_KEY);
    state = { ready: true, data: saved === null ? EMPTY_BUCKET_DATA : parseBucketData(saved), error: null, blocked: false };
  } catch (error) {
    state = {
      ...state, ready: true, blocked: true,
      error: error instanceof SyntaxError ? "Saved bucket lists contain invalid JSON. Clear saved lists to start again." :
        error instanceof Error ? `Could not load bucket lists: ${error.message}` : "Could not load bucket lists.",
    };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === BUCKET_STORAGE_KEY || event.key === null) {
    load();
    emit();
  }
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    load();
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

export function useBucketStore() {
  return useSyncExternalStore(subscribe, () => state, () => initial);
}

export function updateBucketStore(update: (data: BucketData) => BucketData): boolean {
  if (!state.ready || state.blocked) {
    state = { ...state, error: "Bucket lists are unavailable. Clear invalid saved data or enable browser storage before continuing." };
    emit();
    return false;
  }
  try {
    const data = update(state.data);
    const serialized = JSON.stringify(data);
    parseBucketData(serialized);
    localStorage.setItem(BUCKET_STORAGE_KEY, serialized);
    state = { ...state, data, error: null };
    emit();
    return true;
  } catch (error) {
    state = { ...state, error: error instanceof Error ? `Bucket list was not saved: ${error.message}` : "Bucket list was not saved. Browser storage may be unavailable or full." };
    emit();
    return false;
  }
}

export function clearBucketStore(): boolean {
  try {
    localStorage.removeItem(BUCKET_STORAGE_KEY);
    state = { ready: true, data: EMPTY_BUCKET_DATA, error: null, blocked: false };
    emit();
    return true;
  } catch {
    state = { ...state, error: "Could not clear saved bucket lists. Check browser storage permissions." };
    emit();
    return false;
  }
}
