import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../supabase';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Toast from 'react-native-toast-message';
import WebLanding from '../components/WebLanding';
import ConfirmHcaptcha from '../components/Captcha';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [showWebLanding, setShowWebLanding] = useState(Platform.OS === 'web');
  
  // ✨ NEW: Reference for the invisible CAPTCHA
  const captchaRef = useRef<any>(null);

  // --- AUTO-PROFILE GENERATOR ---
  const ensureUserProfile = async (user: any) => {
    try {
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (fetchError) return;

      const hasRealName = profile?.real_name && profile.real_name.trim().length > 0;
      const hasDisplayName = profile?.display_name && profile.display_name.trim().length > 0;

      if (hasRealName && hasDisplayName) return; 

      const emailPrefix = user.email ? user.email.split('@')[0] : 'user';
      const googleName = user.user_metadata?.full_name || user.user_metadata?.name || '';
      
      const finalName = hasRealName ? profile.real_name : (googleName || emailPrefix);
      
      const cleanPrefix = emailPrefix.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 15);
      const randomSuffix = Math.floor(10000 + Math.random() * 90000); 
      const uniqueUsername = hasDisplayName ? profile.display_name : `${cleanPrefix}_${randomSuffix}`;

      await supabase.from('profiles').upsert({ 
        id: user.id, 
        real_name: finalName,            
        display_name: uniqueUsername    
      }, { onConflict: 'id' });

    } catch (e: any) {
      console.log("Profile generation error:", e);
    }
  };

  // --- AUTH LISTENER ---
  useEffect(() => {
    let isRedirecting = false;

    const checkAndRedirect = async (user: any) => {
      if (isRedirecting) return;
      isRedirecting = true;
      
      await ensureUserProfile(user);
      
      if (Platform.OS === 'web') {
        window.location.href = '/home'; 
      } else {
        router.replace('/home');
      }
    };

    const handleWebHash = async () => {
      if (Platform.OS === 'web' && window.location.hash.includes('access_token')) {
        try {
          const hash = window.location.hash.substring(1);
          const params = hash.split('&').reduce((acc, current) => {
            const [key, value] = current.split('=');
            acc[key] = value;
            return acc;
          }, {} as Record<string, string>);

          if (params.access_token && params.refresh_token) {
            window.history.replaceState(null, '', window.location.pathname);
            
            const { data: sessionData } = await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
            
            if (sessionData?.session?.user) {
              checkAndRedirect(sessionData.session.user);
            }
          }
        } catch (e) {
          console.error("Hash error:", e);
        }
      }
    };

    handleWebHash();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) checkAndRedirect(session.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        checkAndRedirect(session.user);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  // --- 1-TAP GOOGLE SIGN-IN ---
  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const redirectUrl = Platform.OS === 'web' 
        ? window.location.origin + '/'
        : Linking.createURL('');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: Platform.OS !== 'web',
        },
      });

      if (error) throw error;
      
      if (Platform.OS !== 'web' && data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

        if (res.type === 'success' && res.url) {
          const hash = res.url.split('#')[1];
          if (hash) {
            const params = hash.split('&').reduce((acc, current) => {
              const [key, value] = current.split('=');
              acc[key] = value;
              return acc;
            }, {} as Record<string, string>);

            if (params.access_token && params.refresh_token) {
              const { data: sessionData } = await supabase.auth.setSession({
                access_token: params.access_token,
                refresh_token: params.refresh_token,
              });
              if (sessionData?.session?.user) {
                await ensureUserProfile(sessionData.session.user);
                router.replace('/home');
              }
            }
          }
        }
      }
    } catch (e: any) {
      Alert.alert('Google Login Error', e.message);
    } finally {
      setLoading(false);
    }
  };

// --- 1-TAP APPLE SIGN-IN ---
  // const handleAppleLogin = async () => {
  //   setLoading(true);
  //   try {
  //     const redirectUrl = Platform.OS === 'web' 
  //       ? window.location.origin + '/'
  //       : Linking.createURL('');

  //     const { data, error } = await supabase.auth.signInWithOAuth({
  //       provider: 'apple',
  //       options: {
  //         redirectTo: redirectUrl,
  //         skipBrowserRedirect: Platform.OS !== 'web',
  //       },
  //     });

  //     if (error) throw error;
      
  //     if (Platform.OS !== 'web' && data?.url) {
  //       const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

  //       if (res.type === 'success' && res.url) {
  //         const hash = res.url.split('#')[1];
  //         if (hash) {
  //           const params = hash.split('&').reduce((acc, current) => {
  //             const [key, value] = current.split('=');
  //             acc[key] = value;
  //             return acc;
  //           }, {} as Record<string, string>);

  //           if (params.access_token && params.refresh_token) {
  //             const { data: sessionData } = await supabase.auth.setSession({
  //               access_token: params.access_token,
  //               refresh_token: params.refresh_token,
  //             });
  //             if (sessionData?.session?.user) {
  //               await ensureUserProfile(sessionData.session.user);
  //               router.replace('/home');
  //             }
  //           }
  //         }
  //       }
  //     }
  //   } catch (e: any) {
  //     Alert.alert('Apple Login Error', e.message);
  //   } finally {
  //     setLoading(false);
  //   }
  // };


// --- ✨ PHASE 1: TRIGGER CAPTCHA ---
  const requestOtp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Toast.show({ type: 'error', text1: 'Invalid Email', text2: 'Please enter a valid email address.', position: 'top' });
      return;
    }

    setLoading(true);
    
    // ✨ WEB BYPASS: Web browsers crash on Native WebViews, so we bypass it just for web testing
    if (Platform.OS === 'web') {
      try {
        const { error } = await supabase.auth.signInWithOtp({ email: trimmedEmail });
        if (error) {
          Toast.show({ type: 'error', text1: 'Error', text2: error.message, position: 'top' });
        } else {
          Toast.show({ type: 'success', text1: 'Code Sent!', text2: `Check your inbox at ${email}`, position: 'top' });
          setStep(2);
        }
      } catch (e: any) {
        Toast.show({ type: 'error', text1: 'Error', text2: e.message, position: 'top' });
      } finally {
        setLoading(false);
      }
      return;
    }

    // 📱 MOBILE ONLY: Wake up the invisible CAPTCHA!
    captchaRef.current?.show();
  };

  // --- ✨ PHASE 2: CATCH TOKEN & SEND OTP ---
  const onCaptchaMessage = async (event: any) => {
    if (event && event.nativeEvent.data) {
      const data = event.nativeEvent.data;
      
      // If the user cancels or the bot fails the test
      if (['cancel', 'error', 'expired'].includes(data)) {
        setLoading(false);
        Toast.show({ type: 'error', text1: 'Security Check Failed', text2: 'Please try again.', position: 'top' });
        return;
      } 
      
      // If it passes, 'data' contains the secure token! We pass it to Supabase.
      try {
        const { error } = await supabase.auth.signInWithOtp({ 
          email: email.trim().toLowerCase(),
          options: { captchaToken: data } // ✨ The Magic Key!
        });
        
        if (error) {
          Toast.show({ type: 'error', text1: 'Could not send code', text2: error.message, position: 'top' });
        } else {
          Toast.show({ type: 'success', text1: 'Code Sent!', text2: `Check your inbox at ${email}`, position: 'top' });
          setStep(2);
        }
      } catch (e: any) {
        Toast.show({ type: 'error', text1: 'Error', text2: e.message || "Could not send OTP.", position: 'top' });
      } finally {
        setLoading(false);
      }
    }
  };

  // --- VERIFY OTP & ACCOUNT RECOVERY ---
  const verifyOtp = async () => {
    if (otp.length < 6) {
      Toast.show({ type: 'error', text1: 'Invalid OTP', text2: 'Please enter the 6-digit code.', position: 'top' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp,
        type: 'email',
      });

      if (error) {
        Toast.show({ type: 'error', text1: 'Verification Failed', text2: error.message, position: 'top' });
        return;
      }

      if (data?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('deleted_at, is_banned, banned_until')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profile?.is_banned) {
          const banDate = new Date(profile.banned_until);
          if (banDate > new Date()) {
            await supabase.auth.signOut();
            Toast.show({ type: 'error', text1: 'Account Suspended', text2: `Ends: ${banDate.toLocaleDateString()}`, position: 'top' });
            return;
          } else {
            await supabase.from('profiles').update({ is_banned: false, report_count: 0 }).eq('id', data.user.id);
          }
        }

        if (profile?.deleted_at) {
          await supabase.from('profiles').update({ deleted_at: null }).eq('id', data.user.id);
          Toast.show({ type: 'success', text1: 'Welcome Back!', text2: 'Your account deletion request has been cancelled.', position: 'top' });
        }

        await ensureUserProfile(data.user);
      }
      
      if (Platform.OS === 'web') window.location.href = '/home';
      else router.replace('/home');
      
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: e.message || 'Verification failed.', position: 'top' });
    } finally {
      setLoading(false);
    }
  };

// ✨ NEW: If they are on Web AND haven't bypassed it, show the Landing Page!
  if (showWebLanding) {
    return <WebLanding onBypass={() => setShowWebLanding(false)} />;
  }

  // Otherwise, show your normal Login Screen...
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.logo}>Boltzy</Text>
        <Text style={styles.subtitle}>
          {step === 1 ? 'Buy, sell, and discover locally.' : `Enter the 6-digit code sent to\n${email}`}
        </Text>

        {step === 1 ? (
          <View style={styles.form}>
            
            <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin} disabled={loading}>
              <Ionicons name="logo-google" size={24} color="#000" style={{ marginRight: 12 }} />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            {/* ✨ NEW: Apple Sign-In Button */}
            {/* {Platform.OS !== 'android' && (
              <TouchableOpacity style={styles.appleButton} onPress={handleAppleLogin} disabled={loading}>
                <Ionicons name="logo-apple" size={24} color="#fff" style={{ marginRight: 12 }} />
                <Text style={styles.appleButtonText}>Continue with Apple</Text>
              </TouchableOpacity>
            )} */}

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with email</Text>
              <View style={styles.dividerLine} />
            </View>

            <TextInput
              style={styles.input}
              placeholder="name@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.button} onPress={requestOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Code</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="123456"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity style={styles.button} onPress={verifyOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & Login</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => setStep(1)} style={styles.backButton}>
              <Text style={styles.backText}>Use a different email</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

{/* ✨ NEW: Only render the CAPTCHA engine if we are on a physical mobile device */}
      {Platform.OS !== 'web' && (
        <ConfirmHcaptcha
          ref={captchaRef}
          siteKey={process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY || ''}
          baseUrl="https://boltzy.in"
          languageCode="en"
          size="invisible" // ✨ THE FIX: Added this line to satisfy TypeScript!
          onMessage={onCaptchaMessage}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', padding: 24, maxWidth: 500, alignSelf: 'center', width: '100%' },
  logo: { fontSize: 48, fontWeight: 'bold', color: '#000', marginBottom: 8, letterSpacing: -1 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 32, lineHeight: 24 },
  form: { width: '100%' },
  
  googleButton: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    ...Platform.select({
      web: { boxShadow: '0px 2px 8px rgba(0,0,0,0.05)' },
      default: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 }
    })
  },
  googleButtonText: { color: '#000', fontSize: 18, fontWeight: '600' },
  
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerText: { marginHorizontal: 12, color: '#888', fontSize: 14, fontWeight: '500' },

  input: { 
    height: 60, 
    borderWidth: 1.5, 
    borderColor: '#eee', 
    borderRadius: 16, 
    paddingHorizontal: 20, 
    fontSize: 18, 
    marginBottom: 20, 
    backgroundColor: '#fafafa',
    color: '#000'
  },
  button: { 
    height: 60, 
    backgroundColor: '#000', 
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.1)' },
      default: { elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 }
    })
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  backButton: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  backText: { color: '#888', fontSize: 15, fontWeight: '600' },
  appleButton: {
    flexDirection: 'row', height: 60, backgroundColor: '#000', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 24,
    ...Platform.select({ web: { boxShadow: '0px 2px 8px rgba(0,0,0,0.1)' }, default: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 } })
  },
  appleButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' }
});
