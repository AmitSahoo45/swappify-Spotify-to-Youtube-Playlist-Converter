"use client";

import axios from "axios";
import { getDashboardAnnouncement, getDashboardStepTargetId } from "@/app/lib/dashboard-a11y";
import { mergeRetryConversionResult } from "@/app/lib/conversion-results";
import { getErrorMessage } from "@/app/lib/errors";
import { estimateYoutubeQuotaUsage, YOUTUBE_DAILY_QUOTA_LIMIT } from "@/app/lib/youtube-quota";
import { PlaylistConversionResult } from "@/app/types/conversion";
import { Playlist, Track } from "@/app/types/playlist";
import { useRouter } from "next/navigation";
import { KeyboardEvent, useEffect, useRef, useState } from "react";

type LoadingState = "parsing" | "converting" | "retrying" | null;
type StepState = "complete" | "current" | "upcoming";
type AuthStatusResponse = {
  isAuthenticated: boolean;
  expiresSoon: boolean;
};

const emptyPlaylist: Playlist = { name: "", description: "", ownerName: "", tracks: [] };
const buttonClassName =
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const steps = [
  {
    title: "Connect YouTube",
    description: "Sign in with Google so Swappify can create a private playlist for you.",
  },
  {
    title: "Import Spotify playlist",
    description: "Paste a Spotify playlist URL and fetch the tracks you want to migrate.",
  },
  {
    title: "Convert tracks",
    description: "Create the YouTube playlist and match each Spotify song with the best candidate.",
  },
  {
    title: "Review and retry",
    description: "See the final report, open the playlist, and manually retry any failed matches.",
  },
] as const;

function getStepState({
  index,
  isAuthenticated,
  playlist,
  conversionResult,
  loadingState,
}: {
  index: number;
  isAuthenticated: boolean;
  playlist: Playlist;
  conversionResult: PlaylistConversionResult | null;
  loadingState: LoadingState;
}): StepState {
  if (index === 0) {
    return isAuthenticated ? "complete" : "current";
  }

  if (!isAuthenticated) {
    return "upcoming";
  }

  if (index === 1) {
    return playlist.tracks.length > 0 ? "complete" : "current";
  }

  if (index === 2) {
    if (conversionResult) {
      return "complete";
    }

    return playlist.tracks.length > 0 || loadingState === "converting" ? "current" : "upcoming";
  }

  if (!conversionResult) {
    return "upcoming";
  }

  if (loadingState === "retrying") {
    return "current";
  }

  return conversionResult.failedCount === 0 ? "complete" : "current";
}

const Dashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [spotifyUrl, setSpotifyUrl] = useState<string>("");
  const [playlist, setPlaylist] = useState<Playlist>(emptyPlaylist);
  const [conversionResult, setConversionResult] = useState<PlaylistConversionResult | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>(null);
  const [error, setError] = useState("");
  const [isSessionExpiringSoon, setIsSessionExpiringSoon] = useState(false);

  const router = useRouter();
  const stepButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const conversionQuotaEstimate = estimateYoutubeQuotaUsage(playlist.tracks);
  const retryQuotaEstimate = estimateYoutubeQuotaUsage(
    conversionResult?.failedTracks.map(({ track }) => track) || [],
    { includePlaylistCreation: false }
  );
  const stepStates = steps.map((_, index) =>
    getStepState({
      index,
      isAuthenticated,
      playlist,
      conversionResult,
      loadingState,
    })
  );
  const completedSteps = stepStates.filter((state) => state === "complete").length;
  const dashboardAnnouncement = getDashboardAnnouncement({
    error,
    loadingState,
    playlistName: playlist.name,
    trackCount: playlist.tracks.length,
    conversionResult,
    isSessionExpiringSoon,
  });

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const { data } = await axios.get<AuthStatusResponse>("/api/auth/status");
      const authenticated = data.isAuthenticated;
      setIsAuthenticated(authenticated);
      setIsSessionExpiringSoon(authenticated && data.expiresSoon);
    } catch {
      setIsAuthenticated(false);
      setIsSessionExpiringSoon(false);
    }
  };

  const handleGoogleSignIn = () => router.push("/api/auth/youtube");

  const focusStepSection = (index: number) => {
    const target = document.getElementById(getDashboardStepTargetId(index));

    if (!target) {
      return;
    }

    target.focus();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const focusAdjacentStepButton = (startIndex: number, direction: 1 | -1) => {
    for (let offset = 1; offset <= steps.length; offset += 1) {
      const nextIndex = (startIndex + direction * offset + steps.length) % steps.length;
      const nextButton = stepButtonRefs.current[nextIndex];

      if (nextButton && !nextButton.disabled) {
        nextButton.focus();
        return;
      }
    }
  };

  const handleStepKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusAdjacentStepButton(index, 1);
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusAdjacentStepButton(index, -1);
    }

    if (event.key === "Home") {
      event.preventDefault();
      stepButtonRefs.current.find((button) => button && !button.disabled)?.focus();
    }

    if (event.key === "End") {
      event.preventDefault();
      [...stepButtonRefs.current].reverse().find((button) => button && !button.disabled)?.focus();
    }
  };

  const handleParse = async () => {
    try {
      setError("");
      setLoadingState("parsing");
      setConversionResult(null);

      const {
        data: { playlist: parsedPlaylist },
      } = await axios.post("/api/parseSpotify", { spotifyUrl });
      setPlaylist(parsedPlaylist);
    } catch (parseError) {
      setError(getErrorMessage(parseError));
      setPlaylist(emptyPlaylist);
    } finally {
      setLoadingState(null);
    }
  };

  const handleCreatePlaylist = async () => {
    try {
      setError("");
      setLoadingState("converting");
      setConversionResult(null);

      const { data } = await axios.post<PlaylistConversionResult>("/api/youtube/createPlaylist", { playlist });
      setConversionResult(data);
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setLoadingState(null);
    }
  };

  const handleFailedTrackChange = (index: number, field: keyof Track, value: string) => {
    setConversionResult((currentResult) => {
      if (!currentResult) {
        return currentResult;
      }

      return {
        ...currentResult,
        failedTracks: currentResult.failedTracks.map((failedTrack, failedTrackIndex) =>
          failedTrackIndex === index
            ? {
                ...failedTrack,
                track: {
                  ...failedTrack.track,
                  [field]: value,
                },
              }
            : failedTrack
        ),
      };
    });
  };

  const handleRetryFailedTracks = async () => {
    if (!conversionResult || conversionResult.failedTracks.length === 0) {
      return;
    }

    try {
      setError("");
      setLoadingState("retrying");

      const retryPlaylist: Playlist = {
        ...playlist,
        tracks: conversionResult.failedTracks.map(({ track }) => ({
          trackName: track.trackName.trim(),
          artistName: track.artistName.trim(),
        })),
      };

      const { data } = await axios.post<PlaylistConversionResult>("/api/youtube/createPlaylist", {
        playlist: retryPlaylist,
        youtubePlaylistId: conversionResult.youtubePlaylistId,
      });

      setConversionResult((currentResult) =>
        currentResult ? mergeRetryConversionResult(currentResult, data) : data
      );
    } catch (retryError) {
      setError(getErrorMessage(retryError));
    } finally {
      setLoadingState(null);
    }
  };

  const handleLogout = async () => {
    try {
      router.push("/api/auth/logout");
      setIsAuthenticated(false);
    } catch (logoutError) {
      setError(getErrorMessage(logoutError));
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {dashboardAnnouncement}
      </div>

      <section
        id={getDashboardStepTargetId(0)}
        tabIndex={-1}
        aria-labelledby="dashboard-title"
        className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-slate-950/30 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
      >
        <div className="border-b border-white/10 bg-gradient-to-r from-emerald-500/20 via-sky-500/15 to-slate-900 px-6 py-8 sm:px-8">
          <div className="space-y-3">
            <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-200">
              Phase 3 conversion flow
            </span>
            <h1 id="dashboard-title" className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Spotify to YouTube Converter
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-200 sm:text-base">
              Import a Spotify playlist, create the YouTube version, and review a clear final report with retry
              controls for any songs that still need a better match.
            </p>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.2em] text-slate-300">
              <span>Progress</span>
              <span>
                {completedSteps} of {steps.length} steps complete
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Playlist conversion progress"
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={completedSteps}
              aria-valuetext={`${completedSteps} of ${steps.length} steps complete`}
              className="h-2 overflow-hidden rounded-full bg-slate-900/70"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-sky-500 transition-all"
                style={{ width: `${(completedSteps / steps.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <nav className="px-6 py-6" aria-label="Conversion steps">
          <p className="sr-only">Use Tab to move between steps and arrow keys to switch focused steps quickly.</p>
          <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => {
            const state = stepStates[index];
            const stateClasses =
              state === "complete"
                ? "border-emerald-400/30 bg-emerald-400/10 hover:border-emerald-300/50"
                : state === "current"
                  ? "border-sky-400/30 bg-sky-400/10 hover:border-sky-300/50"
                  : "border-white/10 bg-slate-950/40";

            return (
              <li key={step.title}>
                <button
                  ref={(element) => {
                    stepButtonRefs.current[index] = element;
                  }}
                  type="button"
                  onClick={() => focusStepSection(index)}
                  onKeyDown={(event) => handleStepKeyDown(event, index)}
                  disabled={state === "upcoming"}
                  aria-current={state === "current" ? "step" : undefined}
                  aria-controls={getDashboardStepTargetId(index)}
                  aria-describedby={`dashboard-step-${index}-description`}
                  className={`flex h-full w-full flex-col rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-400/40 disabled:cursor-not-allowed disabled:opacity-70 ${stateClasses}`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">{step.title}</span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-200">
                      {state}
                    </span>
                  </div>
                  <p id={`dashboard-step-${index}-description`} className="text-sm leading-6 text-slate-300">
                    {step.description}
                  </p>
                </button>
              </li>
            );
          })}
          </ol>
        </nav>
      </section>

      {!isAuthenticated ? (
        <section
          aria-labelledby="connect-youtube-heading"
          className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20"
        >
          <div className="space-y-4">
            <div>
              <h2 id="connect-youtube-heading" className="text-xl font-semibold text-white">
                Start by connecting your YouTube account
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Swappify needs Google / YouTube access before it can create a private playlist and add your matched
                videos.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              aria-describedby="connect-youtube-heading"
              className={`${buttonClassName} bg-blue-500 text-white hover:bg-blue-400`}
            >
              Sign in with Google
            </button>
          </div>
        </section>
      ) : (
        <>
          <section
            id={getDashboardStepTargetId(1)}
            tabIndex={-1}
            aria-labelledby="spotify-import-heading"
            aria-busy={loadingState === "parsing"}
            className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
          >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div>
                  <h2 id="spotify-import-heading" className="text-xl font-semibold text-white">
                    1. Import a Spotify playlist
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Paste a public Spotify playlist link to preview the tracks before you create the YouTube version.
                  </p>
                </div>
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-start"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleParse();
                  }}
                >
                  <div className="w-full space-y-2">
                    <label htmlFor="spotify-playlist-url" className="text-sm font-medium text-slate-200">
                      Spotify playlist URL
                    </label>
                  <input
                    id="spotify-playlist-url"
                    name="spotifyUrl"
                    type="text"
                    placeholder="https://open.spotify.com/playlist/..."
                    autoComplete="url"
                    inputMode="url"
                    value={spotifyUrl}
                    onChange={(event) => setSpotifyUrl(event.target.value)}
                    aria-describedby="spotify-playlist-url-help"
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/20"
                  />
                    <p id="spotify-playlist-url-help" className="text-xs leading-5 text-slate-400">
                      Paste any public Spotify playlist link. Press Enter to submit or use the Parse button.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={loadingState !== null}
                    aria-label={loadingState === "parsing" ? "Parsing Spotify playlist" : "Parse Spotify playlist"}
                    className={`${buttonClassName} bg-emerald-500 text-slate-950 hover:bg-emerald-400`}
                  >
                    {loadingState === "parsing" ? "Parsing playlist..." : "Parse Spotify"}
                  </button>
                </form>
              </div>

              <div aria-live="polite" aria-atomic="true" className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Conversion status</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Authenticated</span>
                    <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                      Ready
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Spotify playlist</span>
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200">
                      {playlist.tracks.length > 0 ? `${playlist.tracks.length} tracks loaded` : "Waiting"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>YouTube conversion</span>
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200">
                      {loadingState === "converting" ? "Running" : conversionResult ? "Finished" : "Not started"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Estimated quota</span>
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200">
                      {playlist.tracks.length > 0
                        ? `${conversionQuotaEstimate.totalUnits.toLocaleString()} units`
                        : "Waiting"}
                    </span>
                  </div>
                  {isSessionExpiringSoon && (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                      Your YouTube session is close to expiring. Swappify will refresh it automatically while creating
                      the playlist.
                    </div>
                  )}
                  <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-3 text-xs leading-5 text-sky-100">
                    {loadingState === "converting"
                      ? "Swappify is creating your playlist and matching each track on YouTube."
                      : loadingState === "retrying"
                        ? "Retrying edited tracks in the existing YouTube playlist."
                        : "Once the playlist is parsed, you can review the tracks and start the conversion."}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {playlist.tracks.length > 0 && (
            <section
              id={getDashboardStepTargetId(2)}
              tabIndex={-1}
              aria-labelledby="review-convert-heading"
              aria-busy={loadingState === "converting"}
              className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <h2 id="review-convert-heading" className="text-xl font-semibold text-white">
                    2. Review and convert
                  </h2>
                  <p className="text-sm leading-6 text-slate-300">
                    Confirm the playlist details, then create the YouTube playlist. You can retry only the failed tracks
                    after the first pass.
                  </p>
                  <div className="space-y-1 text-sm text-slate-300">
                    <p className="font-medium text-white">{playlist.name}</p>
                    <p>Owner: {playlist.ownerName}</p>
                    <p>{playlist.description || "No Spotify description provided."}</p>
                    <p>Found {playlist.tracks.length} tracks.</p>
                    <p>
                      Estimated YouTube quota usage: {conversionQuotaEstimate.totalUnits.toLocaleString()} /{" "}
                      {YOUTUBE_DAILY_QUOTA_LIMIT.toLocaleString()} units.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 lg:max-w-xs">
                  {conversionQuotaEstimate.exceedsDailyQuota && (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                      This playlist may exceed the default 10,000-unit daily YouTube quota. Consider splitting it into
                      smaller batches before converting.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleCreatePlaylist}
                    disabled={loadingState !== null}
                    aria-label={
                      loadingState === "converting" ? "Creating your YouTube playlist" : "Create YouTube playlist"
                    }
                    className={`${buttonClassName} w-full bg-sky-500 text-white hover:bg-sky-400`}
                  >
                    {loadingState === "converting" ? "Creating YouTube playlist..." : "Create YT Playlist"}
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {playlist.tracks.slice(0, 6).map((track, index) => (
                  <div
                    key={`${track.trackName}-${track.artistName}-${index}`}
                    className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                  >
                    <p className="font-medium text-white">{track.trackName}</p>
                    <p className="mt-1 text-sm text-slate-400">{track.artistName}</p>
                  </div>
                ))}
              </div>
              {playlist.tracks.length > 6 && (
                <p className="mt-4 text-sm text-slate-400">Showing 6 of {playlist.tracks.length} tracks before conversion.</p>
              )}
            </section>
          )}

          {conversionResult && (
            <section
              id={getDashboardStepTargetId(3)}
              tabIndex={-1}
              aria-labelledby="conversion-summary-heading"
              aria-busy={loadingState === "retrying"}
              className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <h2 id="conversion-summary-heading" className="text-xl font-semibold text-white">
                    3. Conversion summary
                  </h2>
                  <p className="text-sm leading-6 text-slate-300">
                    Review the final report, open the playlist on YouTube, and retry any tracks that still need manual
                    cleanup.
                  </p>
                  <p className="text-sm text-slate-400">
                    YouTube Playlist ID: <span className="font-mono text-slate-200">{conversionResult.youtubePlaylistId}</span>
                  </p>
                </div>

                <a
                  href={conversionResult.youtubePlaylistUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${buttonClassName} bg-rose-500 text-white hover:bg-rose-400`}
                >
                  Open created YouTube playlist
                </a>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <p className="text-sm text-slate-400">Total tracks</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{conversionResult.totalTracks}</p>
                </div>
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <p className="text-sm text-emerald-100/80">Matched</p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-100">{conversionResult.matchedCount}</p>
                </div>
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                  <p className="text-sm text-amber-100/80">Needs review</p>
                  <p className="mt-2 text-3xl font-semibold text-amber-100">{conversionResult.failedCount}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">Matched tracks</h3>
                    <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                      {conversionResult.matchedCount} added
                    </span>
                  </div>
                  <div className="space-y-3">
                    {conversionResult.matchedTracks.length > 0 ? (
                      conversionResult.matchedTracks.map(({ track, youtubeTitle, videoId }, index) => (
                        <div
                          key={`${videoId}-${index}`}
                          className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4"
                        >
                          <p className="font-medium text-white">
                            {track.trackName} <span className="text-slate-400">— {track.artistName}</span>
                          </p>
                          <p className="mt-1 text-sm text-slate-300">{youtubeTitle}</p>
                          <p className="mt-2 font-mono text-xs text-slate-500">{videoId}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">No tracks have been matched yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Failed matches</h3>
                      <p className="mt-1 text-sm text-slate-400">Edit the track details below and retry only these songs.</p>
                      {conversionResult.failedTracks.length > 0 && (
                        <p className="mt-2 text-xs text-slate-500">
                          Retrying the remaining tracks is estimated to use {retryQuotaEstimate.totalUnits.toLocaleString()}{" "}
                          quota units.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleRetryFailedTracks}
                      disabled={loadingState !== null || conversionResult.failedTracks.length === 0}
                      aria-label={loadingState === "retrying" ? "Retrying failed tracks" : "Retry failed tracks"}
                      className={`${buttonClassName} bg-amber-400 text-slate-950 hover:bg-amber-300`}
                    >
                      {loadingState === "retrying" ? "Retrying..." : "Retry failed tracks"}
                    </button>
                  </div>

                  <div className="space-y-4">
                    {conversionResult.failedTracks.length > 0 ? (
                      conversionResult.failedTracks.map((failedTrack, index) => (
                        <div
                          key={`${failedTrack.track.trackName}-${failedTrack.track.artistName}-${index}`}
                          className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4"
                        >
                          <div className="grid gap-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="grid gap-2 text-sm text-slate-300">
                                <span>Track name</span>
                                <input
                                  type="text"
                                  value={failedTrack.track.trackName}
                                  onChange={(event) => handleFailedTrackChange(index, "trackName", event.target.value)}
                                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none transition focus:border-amber-300/50 focus:ring-2 focus:ring-amber-300/20"
                                />
                              </label>
                              <label className="grid gap-2 text-sm text-slate-300">
                                <span>Artist</span>
                                <input
                                  type="text"
                                  value={failedTrack.track.artistName}
                                  onChange={(event) => handleFailedTrackChange(index, "artistName", event.target.value)}
                                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none transition focus:border-amber-300/50 focus:ring-2 focus:ring-amber-300/20"
                                />
                              </label>
                            </div>
                            <p className="text-sm text-amber-100">{failedTrack.reason}</p>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Attempted search queries
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {failedTrack.attemptedQueries.map((query) => (
                                  <span
                                    key={query}
                                    className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-xs text-slate-300"
                                  >
                                    {query}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
                        Every track was matched successfully. Your YouTube playlist is ready to open.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleLogout}
              className={`${buttonClassName} border border-white/10 bg-slate-900/80 text-slate-200 hover:bg-slate-800`}
            >
              Logout
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="fixed inset-x-4 bottom-4 z-20 ml-auto w-full max-w-md sm:inset-x-auto sm:right-4">
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-2xl border border-red-400/30 bg-slate-950/95 px-4 py-4 shadow-2xl shadow-slate-950/50 backdrop-blur"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-red-200">Something went wrong</p>
                <p className="text-sm leading-6 text-red-100">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => setError("")}
                aria-label="Dismiss error notification"
                className="rounded-full border border-red-400/20 px-3 py-1 text-xs font-medium text-red-100 transition hover:bg-red-400/10 focus:outline-none focus:ring-2 focus:ring-red-300/40"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
