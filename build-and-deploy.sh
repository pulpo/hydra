#!/bin/bash

# Hydra VJ Mixer - Build and Deploy Script
set -e

# Configuration
IMAGE_NAME="hydra-vj-mixer"
IMAGE_TAG="latest"
NAMESPACE="hydra"

echo "🎵 Hydra VJ Mixer - Build and Deploy"
echo "===================================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command_exists docker; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command_exists kubectl; then
    echo "❌ kubectl is not installed. Please install kubectl first."
    exit 1
fi

# Check if kubectl can connect to cluster
if ! kubectl cluster-info >/dev/null 2>&1; then
    echo "❌ Cannot connect to Kubernetes cluster. Please check your kubeconfig."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Build Docker image
echo ""
echo "🐳 Building Docker image..."
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully"
else
    echo "❌ Docker build failed"
    exit 1
fi

# Load image into kind/minikube if detected
if kubectl get nodes | grep -q "kind\|minikube"; then
    echo ""
    echo "🔄 Loading image into local cluster..."
    
    if command_exists kind; then
        kind load docker-image ${IMAGE_NAME}:${IMAGE_TAG}
        echo "✅ Image loaded into kind cluster"
    elif command_exists minikube; then
        minikube image load ${IMAGE_NAME}:${IMAGE_TAG}
        echo "✅ Image loaded into minikube cluster"
    fi
fi

# Deploy to Kubernetes
echo ""
echo "☸️  Deploying to Kubernetes..."

# Apply manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Check if ingress controller is available
if kubectl get ingressclass nginx >/dev/null 2>&1; then
    echo "🌐 Nginx ingress controller detected, applying ingress..."
    kubectl apply -f k8s/ingress.yaml
else
    echo "⚠️  No nginx ingress controller found, skipping ingress deployment"
    echo "   You can access the service via NodePort on ports 30080 (HTTP) and 30081 (WebSocket)"
    kubectl apply -f k8s/service.yaml
fi

# Wait for deployment
echo ""
echo "⏳ Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/hydra-deployment -n ${NAMESPACE}

if [ $? -eq 0 ]; then
    echo "✅ Deployment is ready!"
else
    echo "❌ Deployment failed or timed out"
    echo "📋 Checking pod status..."
    kubectl get pods -n ${NAMESPACE}
    kubectl describe deployment hydra-deployment -n ${NAMESPACE}
    exit 1
fi

# Show deployment info
echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📊 Deployment Status:"
kubectl get all -n ${NAMESPACE}

echo ""
echo "🌐 Access Information:"

# Check for ingress
if kubectl get ingress hydra-ingress -n ${NAMESPACE} >/dev/null 2>&1; then
    INGRESS_HOST=$(kubectl get ingress hydra-ingress -n ${NAMESPACE} -o jsonpath='{.spec.rules[0].host}')
    echo "   Main App: http://${INGRESS_HOST}"
    echo "   Viewer:   http://${INGRESS_HOST}/viewer.html"
    echo ""
    echo "   Note: Make sure '${INGRESS_HOST}' points to your ingress controller IP"
    echo "   You can add this to your /etc/hosts file for local testing"
else
    # NodePort access
    NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="ExternalIP")].address}')
    if [ -z "$NODE_IP" ]; then
        NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
    fi
    
    echo "   Main App: http://${NODE_IP}:30080"
    echo "   Viewer:   http://${NODE_IP}:30080/viewer.html"
    echo "   WebSocket: ws://${NODE_IP}:30081"
fi

echo ""
echo "🔧 Useful Commands:"
echo "   View logs:    kubectl logs -f deployment/hydra-deployment -n ${NAMESPACE}"
echo "   Scale up:     kubectl scale deployment hydra-deployment --replicas=2 -n ${NAMESPACE}"
echo "   Delete:       kubectl delete namespace ${NAMESPACE}"
echo ""
echo "🎵 Happy VJ mixing! 🎵"