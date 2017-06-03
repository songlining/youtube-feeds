kubectl delete deployments,pods,services -l app=youtube-feeds
kubectl create -f ./youtube-feeds-deployment.yaml
kubectl create -f ./youtube-feeds-service.yaml
