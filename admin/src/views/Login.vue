<template>
  <div class="login">
    <div class="login__card">
      <div class="login__brand">
        <div class="login__title">五行律音</div>
        <div class="login__sub">管理后台</div>
      </div>
      <el-form :model="form" @submit.prevent="onSubmit">
        <el-form-item>
          <el-input v-model="form.username" placeholder="管理员账号" size="large" :prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            :prefix-icon="Lock"
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-form-item>
          <div class="login__captcha">
            <el-input
              v-model="form.captchaCode"
              placeholder="验证码"
              size="large"
              maxlength="4"
              :prefix-icon="Key"
              @keyup.enter="onSubmit"
            />
            <!-- 点图换一张：验证码是一次性的，验过即作废 -->
            <img
              v-if="captchaImg"
              :src="captchaImg"
              class="login__captcha-img"
              title="点击更换"
              alt="验证码"
              @click="loadCaptcha"
            />
            <div v-else class="login__captcha-img login__captcha-img--empty" @click="loadCaptcha">
              点击加载
            </div>
          </div>
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" class="login__btn" @click="onSubmit">
          登录
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { User, Lock, Key } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { getCaptcha } from '@/api';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const captchaImg = ref('');
const captchaId = ref('');
const form = reactive({ username: '', password: '', captchaCode: '' });

async function loadCaptcha() {
  try {
    const d = await getCaptcha();
    captchaId.value = d.id;
    captchaImg.value = d.image;
    form.captchaCode = '';
  } catch {
    captchaImg.value = '';   // 拉取失败留个可点击的占位，让用户能重试
  }
}

onMounted(loadCaptcha);

async function onSubmit() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  if (!form.captchaCode) {
    ElMessage.warning('请输入验证码');
    return;
  }
  loading.value = true;
  try {
    await auth.login(form.username, form.password, captchaId.value, form.captchaCode);
    ElMessage.success('登录成功');
    router.push('/dashboard');
  } catch {
    // 错误已由拦截器提示。
    // 验证码一次性，无论成败都已作废，失败后必须换一张，否则用户再点必然还是「验证码错误」。
    loadCaptcha();
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0a0e1a 0%, #03050a 100%);
}
.login__card {
  width: 380px;
  padding: 48px 40px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.login__brand {
  text-align: center;
  margin-bottom: 36px;
}
.login__captcha {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.login__captcha-img {
  flex-shrink: 0;
  width: 120px;
  height: 40px;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  cursor: pointer;
  object-fit: cover;
}
.login__captcha-img--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #909399;
  background: #f5f7fa;
}
.login__title {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: 4px;
  color: #1a1a1a;
}
.login__sub {
  margin-top: 8px;
  font-size: 14px;
  color: #999;
  letter-spacing: 2px;
}
.login__btn {
  width: 100%;
}
</style>
