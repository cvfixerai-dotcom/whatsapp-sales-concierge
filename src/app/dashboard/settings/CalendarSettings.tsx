'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calendar, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface CalendarSettingsProps {
  settings: any;
  onRefresh: () => Promise<void>;
}

export default function CalendarSettings({ settings, onRefresh }: CalendarSettingsProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const searchParams = useSearchParams();

  // Handle OAuth callback success
  useEffect(() => {
    const success = searchParams.get('success');
    if (success === 'true') {
      setMessage({ type: 'success', text: 'Google Calendar connected successfully!' });
      onRefresh();
      
      // Clear the success param from URL
      const url = new URL(window.location.href);
      url.searchParams.delete('success');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams, onRefresh]);

  async function handleDisconnectGoogle() {
    if (!confirm('Are you sure you want to disconnect Google Calendar? Existing appointments will remain in your calendar.')) {
      return;
    }
    
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/settings/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disconnect_google: true }),
      });
      
      if (!response.ok) throw new Error('Failed to disconnect');
      
      setMessage({ type: 'success', text: 'Google Calendar disconnected successfully' });
      await onRefresh();
    } catch (error) {
      console.error('Error disconnecting Google Calendar:', error);
      setMessage({ type: 'error', text: 'Failed to disconnect Google Calendar' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-800 border-green-200' 
            : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span>{message.text}</span>
          </div>
        </div>
      )}
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-green-600" />
            Google Calendar Integration
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Connect your Google Calendar to sync appointments automatically
          </p>
        </div>
        
        <div className="p-6 space-y-6">
          <div className={`p-4 rounded-lg border-2 ${
            settings?.google_connected 
              ? 'bg-green-50 border-green-200' 
              : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center gap-3">
              {settings?.google_connected ? (
                <>
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-900">Google Calendar Connected</p>
                    <p className="text-sm text-green-700">
                      Calendar ID: {settings.google_calendar_id || 'primary'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-6 w-6 text-gray-400" />
                  <div>
                    <p className="font-semibold text-gray-900">Not Connected</p>
                    <p className="text-sm text-gray-600">
                      Connect your Google Calendar to enable automatic appointment sync
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-3">What you get:</h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Automatic appointment sync (both ways)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Google Meet links auto-generated for all bookings</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Real-time availability checking via AI</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Calendar invites sent to customers automatically</span>
              </li>
            </ul>
          </div>

          <div className="flex gap-3">
            {settings?.google_connected ? (
              <button
                type="button"
                onClick={handleDisconnectGoogle}
                disabled={saving}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
                Disconnect Google Calendar
              </button>
            ) : (
              <a
                href="/api/auth/google-calendar"
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-semibold"
              >
                <Calendar className="h-5 w-5" />
                Connect Google Calendar
              </a>
            )}
          </div>

          {!settings?.google_connected && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">How to connect:</h3>
              <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
                <li>Click "Connect Google Calendar" above</li>
                <li>Sign in with your Google account</li>
                <li>Grant calendar permissions</li>
                <li>You'll be redirected back with confirmation</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
