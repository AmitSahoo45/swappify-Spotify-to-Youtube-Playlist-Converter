"use client";

import axios from "axios";
import { getErrorMessage } from "@/app/lib/errors";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Playlist } from "../types/playlist";

interface ConversionResult {
    youtubePlaylistId: string;
    totalTracks: number;
    failedTracks: Playlist["tracks"];
}

const Dashboard = () => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [spotifyUrl, setSpotifyUrl] = useState<string>("");
    const [playlist, setPlaylist] = useState<Playlist>({ name: "", description: "", ownerName: "", tracks: [] });
    const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState("");

    const router = useRouter();

    useEffect(() => {
        checkAuthStatus();
    }, [])

    const checkAuthStatus = async () => {
        try {
            const { data: { isAuthenticated: _isAuthenticated } } = await axios.get("/api/auth/status");
            setIsAuthenticated(_isAuthenticated);
        } catch {
            setIsAuthenticated(false);
        }
    }

    const handleGoogleSignIn = () => router.push("/api/auth/youtube");

    const handleParse = async () => {
        try {
            setError("");
            setLoading(true);

            const { data: { playlist: _playlist } } = await axios.post("/api/parseSpotify", { spotifyUrl });
            setPlaylist(_playlist);
            setLoading(false);
        } catch (error) {
            setError(getErrorMessage(error));
            setLoading(false);
        }
    };

    const handleCreatePlaylist = async () => {
        try {
            setError("");
            setLoading(true);

            const { data } = await axios.post("/api/youtube/createPlaylist", { playlist });
            setConversionResult(data);
            setLoading(false);
        } catch (error) {
            setError(getErrorMessage(error));
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            router.push("/api/auth/logout");
            setIsAuthenticated(false);
        } catch (error) {
            setError(getErrorMessage(error));
        }
    }

    return (
        <div>
            <h1>Spotify to YouTube Converter</h1>

            {!isAuthenticated ? (
                <>
                    <p>Please sign in with Google first to proceed.</p>
                    <button onClick={handleGoogleSignIn} className="border p-2 bg-blue-500 text-white rounded">
                        Sign in with Google
                    </button>
                </>
            ) : (
                <>
                    <div>
                        <input
                            type="text"
                            placeholder="Spotify Playlist URL"
                            value={spotifyUrl}
                            onChange={(e) => setSpotifyUrl(e.target.value)}
                        />
                        <button onClick={handleParse} disabled={loading}>
                            {loading ? "Parsing..." : "Parse Spotify"}
                        </button>
                    </div>

                    {playlist.tracks.length > 0 && (
                        <div>
                            <h2>{playlist.name}</h2>
                            <p>Owner: {playlist.ownerName}</p>
                            <p>Description: {playlist.description}</p>
                            <p>Found {playlist.tracks.length} tracks.</p>
                            <button onClick={handleCreatePlaylist} disabled={loading}>
                                {loading ? "Converting..." : "Create YT Playlist"}
                            </button>
                        </div>
                    )}

                    {conversionResult && (
                        <div>
                            <p>Conversion done! YouTube Playlist ID: {conversionResult.youtubePlaylistId}</p>
                        </div>
                    )}

                    <div>
                        <button onClick={handleLogout}>Logout</button>
                    </div>
                </>
            )}

            {error && <p style={{ color: "red" }}>{error}</p>}
        </div>
    )
}

export default Dashboard
