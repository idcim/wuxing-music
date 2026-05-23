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
        <el-button type="primary" size="large" :loading="loading" class="login__btn" @click="onSubmit">
          登录
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { User, Lock } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const form = reactive({ username: '', password: '' });

async function onSubmit() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  loading.value = true;
  try {
    await auth.login(form.username, form.password);
    ElMessage.success('登录成功');
    router.push('/dashboard');
  } catch {
    // 错误已由拦截器提示
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
