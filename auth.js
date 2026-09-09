import {
  isAccountSetup,
  setupParentAccount,
  loginParent,
  getParentEmail,
} from './auth_manager.js';

const tabSetup = document.getElementById('tab-setup');
const tabLogin = document.getElementById('tab-login');
const formSetup = document.getElementById('form-setup');
const formLogin = document.getElementById('form-login');
const alertMsg = document.getElementById('alert-msg');

const setupEmail = document.getElementById('setup-email');
const setupPassword = document.getElementById('setup-password');
const setupConfirm = document.getElementById('setup-confirm');
const btnSetup = document.getElementById('btn-setup');

const loginPassword = document.getElementById('login-password');
const btnLogin = document.getElementById('btn-login');

function showAlert(text, type = 'error') {
  alertMsg.textContent = text;
  alertMsg.className = `alert ${type}`;
  alertMsg.style.display = 'block';
}

function clearAlert() {
  alertMsg.style.display = 'none';
  alertMsg.textContent = '';
  alertMsg.className = 'alert';
}

function switchTab(tab) {
  clearAlert();
  if (tab === 'setup') {
    tabSetup.classList.add('active');
    tabLogin.classList.remove('active');
    formSetup.classList.add('active');
    formLogin.classList.remove('active');
  } else {
    tabLogin.classList.add('active');
    tabSetup.classList.remove('active');
    formLogin.classList.add('active');
    formSetup.classList.remove('active');
  }
}

tabSetup.addEventListener('click', () => switchTab('setup'));
tabLogin.addEventListener('click', () => switchTab('login'));

formSetup.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();

  const email = setupEmail.value.trim();
  const password = setupPassword.value;
  const confirm = setupConfirm.value;

  if (password.length < 6) {
    showAlert('Password must be at least 6 characters long.');
    return;
  }

  if (password !== confirm) {
    showAlert('Passwords do not match. Please verify.');
    return;
  }

  btnSetup.disabled = true;
  btnSetup.textContent = 'Activating...';

  try {
    await setupParentAccount({ email, password });
    showAlert('Parental Protection activated successfully!', 'success');
    setTimeout(() => {
      window.close();
    }, 1200);
  } catch (err) {
    showAlert(err?.message || 'Failed to set up account.');
    btnSetup.disabled = false;
    btnSetup.textContent = 'Activate Parental Protection';
  }
});

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();

  const password = loginPassword.value;
  btnLogin.disabled = true;
  btnLogin.textContent = 'Verifying...';

  try {
    const success = await loginParent(password);
    if (!success) {
      showAlert('Incorrect master password.');
      btnLogin.disabled = false;
      btnLogin.textContent = 'Unlock Parent Dashboard';
      return;
    }
    showAlert('Parent session unlocked!', 'success');
    setTimeout(() => {
      window.close();
    }, 1000);
  } catch (err) {
    showAlert(err?.message || 'Failed to unlock session.');
    btnLogin.disabled = false;
    btnLogin.textContent = 'Unlock Parent Dashboard';
  }
});

async function init() {
  const configured = await isAccountSetup();
  if (configured) {
    switchTab('login');
    const email = await getParentEmail();
    if (email) {
      tabSetup.textContent = 'Reconfigure Account';
      setupEmail.value = email;
    }
  } else {
    switchTab('setup');
  }
}

init();
