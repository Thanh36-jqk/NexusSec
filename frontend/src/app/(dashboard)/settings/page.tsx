"use client";

import { useEffect, useState } from "react";
import { Settings, User, Mail, Shield, Key, Loader2 } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface UserProfile {
    id: string;
    username: string;
    email: string;
    role: string;
}

export default function SettingsPage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await fetchApi("/auth/me") as { data: UserProfile };
                setProfile(res.data);
            } catch (err) {
                console.error("Failed to fetch user profile", err);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);
    
    return (
        <div className="max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 bg-primary/10 rounded-xl border border-primary/20 shadow-inner">
                    <Settings className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        Account Settings
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Manage your profile and platform preferences.
                    </p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Profile Card */}
                <div className="rounded-xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-sm">
                    <div className="border-b border-border bg-muted/20 px-6 py-4">
                        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <User className="h-4 w-4" /> Profile Information
                        </h2>
                    </div>
                    <div className="p-6 space-y-6">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                        Username
                                    </label>
                                    <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border border-border/50">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm text-foreground">{profile?.username || "Unknown"}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                        Email Address
                                    </label>
                                    <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border border-border/50">
                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm text-foreground">{profile?.email || "Unknown"}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                        Account Role
                                    </label>
                                    <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border border-border/50">
                                        <Shield className="h-4 w-4 text-primary" />
                                        <span className="text-sm capitalize font-medium text-primary shadow-sm bg-primary/10 px-2 py-0.5 rounded-md">{profile?.role || "user"}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Security Card */}
                <div className="rounded-xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-sm">
                    <div className="border-b border-border bg-muted/20 px-6 py-4">
                        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Shield className="h-4 w-4" /> Security Context
                        </h2>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="space-y-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-sm font-medium text-foreground">Password</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Update your password to keep your account secure.
                                    </p>
                                </div>
                                <button className="text-xs font-medium bg-muted text-foreground px-3 py-1.5 rounded-md hover:bg-muted/80 transition-colors">
                                    Update
                                </button>
                            </div>
                            <div className="h-px bg-border/50" />
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-sm font-medium text-foreground">API Keys</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Manage API keys for CI/CD integration.
                                    </p>
                                </div>
                                <button className="text-xs font-medium bg-primary/10 text-primary px-3 py-1.5 rounded-md hover:bg-primary/20 transition-colors">
                                    Manage
                                </button>
                            </div>
                            <div className="h-px bg-border/50" />
                            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 mt-6">
                                <Key className="h-5 w-5 text-emerald-500" />
                                <div>
                                    <h4 className="text-sm font-medium text-emerald-500">JWT Strict Mode Active</h4>
                                    <p className="text-xs text-emerald-500/80">Your session is secured via RSA256 signature HttpOnly cookies.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
