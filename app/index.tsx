import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert, KeyboardAvoidingView,
  Modal,
  Platform, ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View
} from 'react-native';
import Toast from 'react-native-toast-message';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';
import WebLanding from '../components/WebLanding';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../supabase';

WebBrowser.maybeCompleteAuthSession();

const ALL_CATEGORIES = [
  'Mobiles','Vehicles','Properties','Electronics','Furniture',
  'Fashion','Bikes','Jobs','Books','Sports','Pets'
];
type AuthMode = 'otp' | 'login' | 'signup' | 'forgot';

export default function LoginScreen() {
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false); 
  const [loading, setLoading] = useState(false);
  const [showWebLanding, setShowWebLanding] = useState(Platform.OS === 'web');
  const [pendingAuthAction, setPendingAuthAction] = useState<'otp' | 'signup' | 'login' | 'forgot' | null>(null);
  
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalModalType, setLegalModalType] = useState<'terms' | 'privacy' | null>(null);

  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const captchaRef = useRef<any>(null);

  const isStrongPassword = (pass: string) => {
    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    return pass.length >= 8 && hasUpper && hasLower && hasNumber && hasSpecial;
  };

  const logTermsConsent = async (userId: string) => {
    try {
      await supabase.from('profiles').upsert({
        id: userId,
        terms_accepted_at: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (e) {
      console.log('Error logging terms consent:', e);
    }
  };

  const ensureUserProfile = async (user: any) => {
    try {
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (fetchError) return profile;

      const hasRealName = profile?.real_name && profile.real_name.trim().length > 0;
      const hasDisplayName = profile?.display_name && profile.display_name.trim().length > 0;

      if (!hasRealName || !hasDisplayName) { 
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
      }

      return profile;

    } catch (e: any) {
      console.log("Profile generation error:", e);
      return null;
    }
  };

  useEffect(() => {
    let isRedirecting = false;

    const checkAndRedirect = async (user: any) => {
      if (isRedirecting) return;
      isRedirecting = true;
      setCurrentUser(user);
      
      const profile = await ensureUserProfile(user);

      if (profile?.is_banned) {
        const banDate = new Date(profile.banned_until);
        if (banDate > new Date()) {
          await supabase.auth.signOut(); 
          isRedirecting = false; 
          
          if (Platform.OS === 'web') {
            window.alert(`Account Suspended until ${banDate.toLocaleDateString()}.\nEmail grievance@boltzy.in to appeal.`);
          } else {
            Alert.alert(
              'Account Suspended',
              `Your account has been suspended until ${banDate.toLocaleDateString()}.\n\nUnder IT Rules, you have the right to appeal this decision to our Grievance Officer.`,
              [
                { text: 'Close', style: 'cancel' },
                { 
                  text: 'Submit Appeal', 
                  onPress: () => Linking.openURL(`mailto:grievance@boltzy.in?subject=Account Ban Appeal - ID: ${user.id}&body=Hello Grievance Officer,%0A%0AI would like to request a review of my account suspension.%0A%0ARegistered Email: ${user.email}%0A%0AMy Reason for Appeal:%0A`) 
                }
              ]
            );
          }
          return; 
        } else {
          await supabase.from('profiles').update({ is_banned: false, report_count: 0 }).eq('id', user.id);
        }
      }

      await logTermsConsent(user.id);
      
      if (!profile?.interests || profile.interests.length === 0) {
        setStep(3); 
        return; 
      }

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

  const incomingUrl = useURL();

  useEffect(() => {
    if (incomingUrl && Platform.OS !== 'web') {
      try {
        const parsedUrl = new URL(incomingUrl);
        const hash = parsedUrl.hash || parsedUrl.search; 
        
        if (hash) {
          const params = hash.substring(1).split('&').reduce((acc, current) => {
            const [key, value] = current.split('=');
            acc[key] = value;
            return acc;
          }, {} as Record<string, string>);

          if (params.access_token && params.refresh_token) {
            supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            }).then(() => {
              Toast.show({ type: 'success', text1: 'Logged In!', position: 'top' });
              setAuthMode('login'); 
            });
          }
        }
      } catch (error) {
        console.error("Deep Link Parsing Error:", error);
      }
    }
  }, [incomingUrl]);

  const verifyTermsChecked = () => {
    if (!acceptedTerms) {
      Toast.show({ 
        type: 'error', 
        text1: 'Agreement Required', 
        text2: 'Please accept the Terms of Service & Privacy Policy to continue.', 
        position: 'top' 
      });
      return false;
    }
    return true;
  };

  const handleGoogleLogin = async () => {
    if (!verifyTermsChecked()) return;

    setLoading(true);
    try {
      const redirectUrl = Platform.OS === 'web' 
        ? window.location.origin + '/'
        : Linking.createURL('/');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: Platform.OS !== 'web',
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error("Could not connect to Google. Check Supabase Redirect URLs."); 

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
              await supabase.auth.setSession({
                access_token: params.access_token,
                refresh_token: params.refresh_token,
              });
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

  const handlePasswordReset = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Toast.show({ type: 'error', text1: 'Invalid Email', text2: 'Please enter your email address.', position: 'top' });
      return;
    }

    setPendingAuthAction('forgot');
    captchaRef.current?.show();
  };

  const handlePasswordAuth = async () => {
    if (!verifyTermsChecked()) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Toast.show({ type: 'error', text1: 'Invalid Email', text2: 'Please enter a valid email address.', position: 'top' });
      return;
    }
    if (!password) {
      Toast.show({ type: 'error', text1: 'Password Required', text2: 'Please enter your password.', position: 'top' });
      return;
    }

    if (authMode === 'signup') {
      if (!fullName.trim()) {
        Toast.show({ type: 'error', text1: 'Name Required', text2: 'Please enter your full name.', position: 'top' });
        return;
      }
      if (fullName.trim().length > 28) {
        Toast.show({ type: 'error', text1: 'Name Too Long', text2: 'Name cannot exceed 28 characters.', position: 'top' });
        return;
      }

      if (!isStrongPassword(password)) {
        Toast.show({ type: 'error', text1: 'Weak Password', text2: 'Must be 8+ characters with uppercase, lowercase, number, and symbol.', position: 'top' });
        return;
      }
      setPendingAuthAction('signup');
      captchaRef.current?.show();
    } else {
      setPendingAuthAction('login');
      captchaRef.current?.show();
    }
  };

  const requestOtp = async () => {
    if (!verifyTermsChecked()) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Toast.show({ type: 'error', text1: 'Invalid Email', text2: 'Please enter a valid email address.', position: 'top' });
      return;
    }
    
    setPendingAuthAction('otp');
    captchaRef.current?.show();
  };

  const onCaptchaMessage = async (event: any) => {
    if (event && event.nativeEvent.data) {
      const data = event.nativeEvent.data;
      
      if (data === 'open') {
        return; 
      }
      
      if (typeof data === 'string' && data.length < 100) {
        if (['cancel', 'close', 'error', 'expired', 'challenge-closed'].includes(data.toLowerCase())) {
          captchaRef.current?.hide(); 
          setPendingAuthAction(null);
          if (['error', 'expired'].includes(data.toLowerCase())) {
            Toast.show({ type: 'error', text1: 'Security Check Failed', text2: 'Please try again.', position: 'top' });
          }
          return; 
        }
      }
      
      captchaRef.current?.hide();
      setLoading(true);
      const trimmedEmail = email.trim().toLowerCase();
      
      try {
        if (pendingAuthAction === 'otp') {
          const redirectUrl = Linking.createURL('/');
          const { error } = await supabase.auth.signInWithOtp({ 
            email: trimmedEmail,
            options: { captchaToken: data, emailRedirectTo: redirectUrl }
          });
          if (error) throw error;
          Toast.show({ type: 'success', text1: 'Code Sent!', text2: `Check your inbox at ${email}`, position: 'top' });
          setStep(2);
        } 
        else if (pendingAuthAction === 'signup') {
          const { error } = await supabase.auth.signUp({ 
            email: trimmedEmail, 
            password,
            options: { 
              captchaToken: data,
              data: { full_name: fullName.trim() } 
            }
          });
          if (error) throw error;
          Toast.show({ type: 'success', text1: 'Account Created!', text2: 'Please check your email.', position: 'top' });
          setAuthMode('login');
        }
        else if (pendingAuthAction === 'login') {
          const { error } = await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
            options: { captchaToken: data } 
          });
          if (error) throw error;
        }
        else if (pendingAuthAction === 'forgot') {
          const redirectUrl = Linking.createURL('/reset-password');
          const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, { 
            redirectTo: redirectUrl,
            captchaToken: data
          });
          if (error) throw error;
          
          Toast.show({ type: 'success', text1: 'Reset Email Sent', text2: 'Check your inbox for password reset instructions.', position: 'top' });
          setAuthMode('login');
        }
      } catch (e: any) {
        Toast.show({ type: 'error', text1: 'Auth Error', text2: e.message, position: 'top' });
      } finally {
        setLoading(false);
        setPendingAuthAction(null);
      }
    }
  };

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

      if (error) throw error;

      if (data?.user) {
        const { data: profile } = await supabase.from('profiles').select('deleted_at').eq('id', data.user.id).maybeSingle();
        if (profile?.deleted_at) {
          await supabase.from('profiles').update({ deleted_at: null }).eq('id', data.user.id);
          Toast.show({ type: 'success', text1: 'Welcome Back!', text2: 'Your account deletion request has been cancelled.', position: 'top' });
        }
      }
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: e.message || 'Verification failed.', position: 'top' });
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (category: string) => {
    if (selectedInterests.includes(category)) {
      setSelectedInterests(prev => prev.filter(c => c !== category));
    } else {
      if (selectedInterests.length >= 4) {
        Toast.show({ type: 'info', text1: 'Limit Reached', text2: 'You can only select up to 4 interests.', position: 'top' });
        return;
      }
      setSelectedInterests(prev => [...prev, category]);
    }
  };

  const saveInterestsAndFinish = async () => {
    if (selectedInterests.length === 0) {
      Toast.show({ type: 'error', text1: 'Select Interests', text2: 'Please pick at least one category to continue.', position: 'top' });
      return;
    }
    
    setLoading(true);
    try {
      if (currentUser) {
        const { error } = await supabase.from('profiles').update({ interests: selectedInterests }).eq('id', currentUser.id);
        if (error) throw error;
      }
      
      if (Platform.OS === 'web') window.location.href = '/home';
      else router.replace('/home');
      
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not save your interests. Please try again.', position: 'top' });
    } finally {
      setLoading(false);
    }
  };

  if (showWebLanding) {
    return <WebLanding onBypass={() => setShowWebLanding(false)} />;
  }

  const getSubtitle = () => {
    if (step === 3) return 'What are you looking for?';
    if (step === 2) return `Enter the 6-digit code sent to\n${email}`;
    if (authMode === 'forgot') return 'Reset your password';
    if (authMode === 'signup') return 'Create a new account';
    return 'Buy, sell, and discover locally.';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          contentContainerStyle={[styles.inner, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step !== 3 && <Text style={[styles.logo, { color: colors.text }]}>Boltzy</Text>}
          
          <Text style={[styles.subtitle, { color: colors.textSecondary }, step === 3 && { fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 8 }]}>
            {getSubtitle()}
          </Text>

          {step === 3 && (
             <Text style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 24 }}>
               Pick up to 4 categories to personalize your feed.
             </Text>
          )}

          {step === 1 && (
            <View style={styles.form}>
              
              {(authMode === 'otp' || authMode === 'login' || authMode === 'signup') && (
                <>
                  <TouchableOpacity style={[styles.googleButton, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={handleGoogleLogin} disabled={loading}>
                    <Ionicons name="logo-google" size={24} color={colors.text} style={{ marginRight: 12 }} />
                    <Text style={[styles.googleButtonText, { color: colors.text }]}>Continue with Google</Text>
                  </TouchableOpacity>

                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or continue with email</Text>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  </View>
                </>
              )}

              {authMode === 'signup' && (
                <View style={{ marginBottom: 16 }}>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text, marginBottom: 4 }]}
                    placeholder="Full Name"
                    placeholderTextColor={colors.textSecondary}
                    value={fullName}
                    onChangeText={setFullName}
                    maxLength={28}
                    autoCapitalize="words"
                  />
                  {fullName.length >= 28 && (
                    <Text style={{ fontSize: 12, color: '#FF3B30', textAlign: 'right', paddingRight: 4, fontWeight: 'bold' }}>
                      Limit Reached
                    </Text>
                  )}
                </View>
              )}

              <TextInput
                style={[styles.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }]}
                placeholder="name@example.com"
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {(authMode === 'login' || authMode === 'signup') && (
                <View style={[styles.passwordContainer, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text }]}
                    placeholder="Password"
                    placeholderTextColor={colors.textSecondary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}

              {authMode === 'signup' && (
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 16, paddingHorizontal: 4 }}>
                  Password must contain 8+ characters, including an uppercase letter, lowercase letter, number, and special character.
                </Text>
              )}

              {authMode !== 'forgot' && (
                <View style={styles.checkboxRow}>
                  <TouchableOpacity 
                    style={[styles.checkbox, { borderColor: colors.textSecondary, backgroundColor: colors.card }, acceptedTerms && [styles.checkboxChecked, { backgroundColor: colors.tint, borderColor: colors.tint }]]} 
                    onPress={() => setAcceptedTerms(!acceptedTerms)}
                    activeOpacity={0.8}
                  >
                    {acceptedTerms && <Ionicons name="checkmark" size={16} color={isDark ? '#000' : '#fff'} />}
                  </TouchableOpacity>
                  <Text style={[styles.checkboxLabel, { color: colors.textSecondary }]}>
                    I agree to Boltzy's{' '}
                    <Text style={styles.legalLink} onPress={() => setLegalModalType('terms')}>Terms of Service</Text>
                    {' '}and{' '}
                    <Text style={styles.legalLink} onPress={() => setLegalModalType('privacy')}>Privacy Policy</Text>.
                  </Text>
                </View>
              )}

              {authMode === 'otp' && (
                <TouchableOpacity style={[styles.button, { backgroundColor: colors.tint }]} onPress={requestOtp} disabled={loading}>
                  {loading ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.buttonText, { color: isDark ? '#000' : '#fff' }]}>Send Code</Text>}
                </TouchableOpacity>
              )}

              {(authMode === 'login' || authMode === 'signup') && (
                <TouchableOpacity style={[styles.button, { backgroundColor: colors.tint }]} onPress={handlePasswordAuth} disabled={loading}>
                  {loading ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.buttonText, { color: isDark ? '#000' : '#fff' }]}>{authMode === 'login' ? 'Sign In' : 'Sign Up'}</Text>}
                </TouchableOpacity>
              )}

              {authMode === 'forgot' && (
                <TouchableOpacity style={[styles.button, { backgroundColor: colors.tint }]} onPress={handlePasswordReset} disabled={loading}>
                  {loading ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.buttonText, { color: isDark ? '#000' : '#fff' }]}>Send Reset Link</Text>}
                </TouchableOpacity>
              )}

              <View style={styles.linkRow}>
                {authMode === 'otp' && (
                  <TouchableOpacity onPress={() => setAuthMode('login')}>
                    <Text style={[styles.linkText, { color: colors.textSecondary }]}>Sign in with Password instead</Text>
                  </TouchableOpacity>
                )}

                {authMode === 'login' && (
                  <>
                    <TouchableOpacity onPress={() => setAuthMode('forgot')}>
                      <Text style={[styles.linkText, { color: colors.textSecondary }]}>Forgot Password?</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAuthMode('signup')} style={{ marginTop: 16 }}>
                      <Text style={[styles.linkText, { color: colors.textSecondary }]}>New user? <Text style={{ color: colors.text, fontWeight: 'bold' }}>Sign Up</Text></Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAuthMode('otp')} style={{ marginTop: 16 }}>
                      <Text style={[styles.linkText, { color: colors.textSecondary }]}>Use a Login Code instead</Text>
                    </TouchableOpacity>
                  </>
                )}

                {authMode === 'signup' && (
                  <TouchableOpacity onPress={() => setAuthMode('login')}>
                    <Text style={[styles.linkText, { color: colors.textSecondary }]}>Already have an account? <Text style={{ color: colors.text, fontWeight: 'bold' }}>Sign In</Text></Text>
                  </TouchableOpacity>
                )}

                {authMode === 'forgot' && (
                  <TouchableOpacity onPress={() => setAuthMode('login')}>
                    <Text style={[styles.linkText, { color: colors.textSecondary }]}>Back to Sign In</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.form}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, color: colors.text }]}
                placeholder="123456"
                placeholderTextColor={colors.textSecondary}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
              <TouchableOpacity style={[styles.button, { backgroundColor: colors.tint }]} onPress={verifyOtp} disabled={loading}>
                {loading ? <ActivityIndicator color={isDark ? '#000' : '#fff'} /> : <Text style={[styles.buttonText, { color: isDark ? '#000' : '#fff' }]}>Verify & Login</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => { setStep(1); setOtp(''); }} style={styles.backButton}>
                <Text style={[styles.linkText, { color: colors.textSecondary }]}>Use a different email</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 3 && (
            <View style={styles.form}>
              <View style={styles.interestsGrid}>
                {ALL_CATEGORIES.map((cat) => {
                  const isSelected = selectedInterests.includes(cat);
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.interestChip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }, isSelected && { backgroundColor: colors.tint, borderColor: colors.tint }]}
                      onPress={() => toggleInterest(cat)}
                    >
                      <Text style={[styles.interestChipText, { color: colors.textSecondary }, isSelected && { color: isDark ? '#000' : '#fff' }]}>
                        {cat}
                      </Text>
                      {isSelected && <Ionicons name="checkmark-circle" size={16} color={isDark ? '#000' : '#fff'} style={{ marginLeft: 6 }} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
              
              <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.textSecondary, fontWeight: '600' }}>
                  {selectedInterests.length}/4 Selected
                </Text>
                <TouchableOpacity 
                  style={[styles.finishButton, selectedInterests.length === 0 && { opacity: 0.5 }]} 
                  onPress={saveInterestsAndFinish} 
                  disabled={loading || selectedInterests.length === 0}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.finishButtonText}>Continue</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={legalModalType !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {legalModalType === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </Text>
              <TouchableOpacity onPress={() => setLegalModalType(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, paddingVertical: 10 }}>
              {legalModalType === 'terms' ? (
                <>
                  <Text style={[styles.legalHeading, { color: colors.text }]}>1. Acceptance of Terms</Text>
                  <Text style={[styles.legalBody, { color: colors.textSecondary }]}>By creating an account or accessing Boltzy, you agree to comply with and be bound by these Terms of Service.</Text>
                  
                  <Text style={[styles.legalHeading, { color: colors.text }]}>2. Marketplace Platform</Text>
                  <Text style={[styles.legalBody, { color: colors.textSecondary }]}>Boltzy provides a local peer-to-peer classifieds network connecting buyers and sellers. Boltzy is not a party to direct financial transactions between users. Users meet and transact at their own discretion and risk.</Text>
                  
                  <Text style={[styles.legalHeading, { color: colors.text }]}>3. Prohibited Conduct</Text>
                  <Text style={[styles.legalBody, { color: colors.textSecondary }]}>You agree not to post false, misleading, abusive, fraudulent, or illegal listings. Counterfeit goods, weapons, illegal drugs, and explicit content are strictly prohibited.</Text>
                  
                  <Text style={[styles.legalHeading, { color: colors.text }]}>4. Paid Promotions</Text>
                  <Text style={[styles.legalBody, { color: colors.textSecondary }]}>All digital ad promotion purchases (Gold / Promoted Ads) processed via Razorpay are strictly non-refundable once activated.</Text>

                  <Text style={[styles.legalHeading, { color: colors.text }]}>5. Contact</Text>
                  <Text style={[styles.legalBody, { color: colors.textSecondary }]}>For support queries, email support@boltzy.in. Registered in Hyderabad, Telangana, India.</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.legalHeading, { color: colors.text }]}>1. Information We Collect</Text>
                  <Text style={[styles.legalBody, { color: colors.textSecondary }]}>We collect your email address, profile username, contact phone number, location details (with consent), and app interaction history to provide local marketplace services under the DPDP Act, 2023.</Text>
                  
                  <Text style={[styles.legalHeading, { color: colors.text }]}>2. Usage of Personal Data</Text>
                  <Text style={[styles.legalBody, { color: colors.textSecondary }]}>Your data is used exclusively to display listings near your location, facilitate real-time chat between buyers and sellers, prevent spam, and personalize your feed experience.</Text>
                  
                  <Text style={[styles.legalHeading, { color: colors.text }]}>3. Data Protection & Sharing</Text>
                  <Text style={[styles.legalBody, { color: colors.textSecondary }]}>We do not sell your personal data. We utilize secure backend infrastructure (Supabase) and encryption protocols to protect your information.</Text>

                  <Text style={[styles.legalHeading, { color: colors.text }]}>4. Account Deletion Rights</Text>
                  <Text style={[styles.legalBody, { color: colors.textSecondary }]}>You reserve the right to request deletion of your account and personal data at any time through the in-app Profile Settings.</Text>

                  <Text style={[styles.legalHeading, { color: colors.text }]}>5. Grievance Officer</Text>
                  <Text style={[styles.legalBody, { color: colors.textSecondary }]}>Grievance Officer: Mohammed Imam Khan (grievance@boltzy.in), Hyderabad, Telangana, India.</Text>
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={[styles.modalCloseBtn, { backgroundColor: colors.tint }]} onPress={() => setLegalModalType(null)}>
              <Text style={[styles.modalCloseBtnText, { color: isDark ? '#000' : '#fff' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {Platform.OS !== 'web' && (
        <ConfirmHcaptcha
          ref={captchaRef}
          siteKey={process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY || ''}
          baseUrl="https://boltzy.in"
          languageCode="en"
          size="invisible"       
          onMessage={onCaptchaMessage}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24, maxWidth: 500, alignSelf: 'center', width: '100%' },
  logo: { fontSize: 40, fontWeight: 'bold', marginBottom: 8, letterSpacing: -1, marginTop: 10 },
  subtitle: { fontSize: 16, marginBottom: 32, lineHeight: 24 },
  form: { width: '100%' },
  
  googleButton: {
    flexDirection: 'row', height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 24,
    borderWidth: 0, // Removed border
    ...Platform.select({ web: { boxShadow: '4px 4px 10px rgba(0,0,0,0.1)' }, default: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 }})
  },
  input: { 
    height: 60, borderRadius: 16, paddingHorizontal: 20, fontSize: 18, marginBottom: 16, 
    borderWidth: 0, // Faux-inset
  },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center', height: 60, borderRadius: 16, marginBottom: 16, 
    borderWidth: 0, // Faux-inset
  },
  button: { 
    height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center',
    ...Platform.select({ web: { boxShadow: '4px 4px 12px rgba(0,0,0,0.15)' }, default: { elevation: 6, shadowColor: '#000', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10 }})
  },
  interestChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, 
    borderWidth: 0, // Removed border
    ...Platform.select({ web: { boxShadow: '2px 2px 6px rgba(0,0,0,0.1)' }, default: { elevation: 3, shadowColor: '#000', shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.1, shadowRadius: 5 }})
  },
  googleButtonText: { fontSize: 18, fontWeight: '600' },
  
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 12, fontSize: 14, fontWeight: '500' },

  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 20,
    fontSize: 18,
  },
  eyeIcon: {
    paddingHorizontal: 15,
    height: '100%',
    justifyContent: 'center',
  },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    borderWidth: 0,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  legalLink: {
    color: '#007AFF',
    fontWeight: 'bold',
  },

  
  buttonText: { fontSize: 18, fontWeight: 'bold' },
  
  linkRow: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  linkText: { fontSize: 15, fontWeight: '500' },
  backButton: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },

  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  interestChipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  finishButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    flex: 0.8, 
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  legalHeading: {
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 4,
  },
  legalBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  modalCloseBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});