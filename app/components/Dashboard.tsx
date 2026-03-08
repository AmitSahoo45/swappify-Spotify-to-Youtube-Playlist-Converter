"use client";

import axios from "axios";
import { mergeRetryConversionResult } from "@/app/lib/conversion-results";
import { getErrorMessage } from "@/app/lib/errors";
import { estimateYoutubeQuotaUsage, YOUTUBE_DAILY_QUOTA_LIMIT } from "@/app/lib/youtube-quota";
import { PlaylistConversionResult } from "@/app/types/conversion";
import { Playlist, Track } from "@/app/types/playlist";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

  const conversionQuotaEstimate = estimateYoutubeQuotaUsage(playlist.tracks);
  const retryQuotaEstimate = estimateYoutubeQuotaUsage(
    conversionResult?.failedTracks.map(({ track }) => track) || [],
    { includePlaylistCreation: false }
  );

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
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-slate-950/30">
        <div className="border-b border-white/10 bg-gradient-to-r from-emerald-500/20 via-sky-500/15 to-slate-900 px-6 py-8 sm:px-8">
          <div className="space-y-3">
            <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-200">
              Phase 3 conversion flow
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Spotify to YouTube Converter
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-200 sm:text-base">
              Import a Spotify playlist, create the YouTube version, and review a clear final report with retry
              controls for any songs that still need a better match.
            </p>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => {
            const state = getStepState({
              index,
              isAuthenticated,
              playlist,
              conversionResult,
              loadingState,
            });
            const stateClasses =
              state === "complete"
                ? "border-emerald-400/30 bg-emerald-400/10"
                : state === "current"
                  ? "border-sky-400/30 bg-sky-400/10"
                  : "border-white/10 bg-slate-950/40";

            return (
              <div key={step.title} className={`rounded-2xl border p-4 ${stateClasses}`}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{step.title}</span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-200">
                    {state}
                  </span>
                </div>
                <p className="text-sm leading-6 text-slate-300">{step.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {!isAuthenticated ? (
        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Start by connecting your YouTube account</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Swappify needs Google / YouTube access before it can create a private playlist and add your matched
                videos.
              </p>
            </div>
            <button
              onClick={handleGoogleSignIn}
              className={`${buttonClassName} bg-blue-500 text-white hover:bg-blue-400`}
            >
              Sign in with Google
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">1. Import a Spotify playlist</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Paste a public Spotify playlist link to preview the tracks before you create the YouTube version.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    placeholder="https://open.spotify.com/playlist/..."
                    value={spotifyUrl}
                    onChange={(event) => setSpotifyUrl(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/20"
                  />
                  <button
                    onClick={handleParse}
                    disabled={loadingState !== null}
                    className={`${buttonClassName} bg-emerald-500 text-slate-950 hover:bg-emerald-400`}
                  >
                    {loadingState === "parsing" ? "Parsing playlist..." : "Parse Spotify"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
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
            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-white">2. Review and convert</h2>
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
                    onClick={handleCreatePlaylist}
                    disabled={loadingState !== null}
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
            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-white">3. Conversion summary</h2>
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
                      onClick={handleRetryFailedTracks}
                      disabled={loadingState !== null || conversionResult.failedTracks.length === 0}
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
              onClick={handleLogout}
              className={`${buttonClassName} border border-white/10 bg-slate-900/80 text-slate-200 hover:bg-slate-800`}
            >
              Logout
            </button>
          </div>
        </>
      )}

      {error && <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div>}
    </div>
  );
};

export default Dashboard;
